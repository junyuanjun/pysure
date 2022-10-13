// style
import './SuRE.css'

// react
import React, { useState } from 'react';
import Tabs from '@mui/material/Tabs';
import Tab from '@mui/material/Tab';
import Typography from '@mui/material/Typography';
import Box from '@mui/material/Box';
import TextList from './component/TextList/TextList';
import AlignedTree from "./component/AlignedTree/AlignedTree";
import {bindActionCreators} from "redux";
import * as actions from "./reducer/action";
import {connect} from "react-redux";
import {column_order_by_feat_freq} from "./utils/utils";
import HierarchicalList from "./component/HierarchicalList/HierarchicalList";
import {colorCate, MAXINT} from "./utils/const";
import {renderD3} from "./hooks/render.hook";
import RuleEditor from "./component/RuleEditor/RuleEditor";
import RuleSuggestion from "./component/RuleSuggestion/RuleSuggestion";
import {Grid} from "@mui/material";

function TabPanel(props) {
    const { children, value, index, ...other } = props;

    return (
        <div
            role="tabpanel"
            hidden={value !== index}
            id={`simple-tabpanel-${index}`}
            aria-labelledby={`simple-tab-${index}`}
            {...other}
        >
            {value === index && (
                <Box sx={{ p: 3 }}>
                    <Typography>{children}</Typography>
                </Box>
            )}
        </div>
    );
}

function a11yProps(index) {
    return {
        id: `simple-tab-${index}`,
        'aria-controls': `simple-tabpanel-${index}`,
    };
}

const SuRE = ( props ) => {
    const [value, setValue] = React.useState(2);
    const col_order = column_order_by_feat_freq(props.columns, props.rules);
    const canvas = document.getElementsByClassName('canvas4text'),
        ctx = canvas[0].getContext('2d');
    ctx.font = '14px sans-serif';
    const attrs = props.columns;
    const tot_size = props.y_gt.length;
    const {lattice, filter_threshold, rules, preIndex, real_min, real_max, node_info, target_names, data,
        set_selected_rule, data_value,
    } = props;

    const handleChange = (event, newValue) => {
        setValue(newValue);
    };

    const clear_plot = (svgref) => {
        svgref.selectAll('*').remove();
    }

    const render_legend = (headerGroup) => {
        props.target_names.forEach((d, i) => {
            // create new false patterns
            let pattern = headerGroup.append("pattern")
                .attr("id", `false-class-${i}`)
                .attr("class", 'false_class')
                .attr("patternUnits", "userSpaceOnUse")
                .attr("width", "4")
                .attr("height", "4");

            pattern.append('rect')
                .attr('width', 4)
                .attr('height', 4)
                .attr('fill', colorCate[i]);

            pattern.append('path')
                .attr('d', "M-1,1 l2,-2 M0,4 l4,-4 M3,5 l2,-2");
        })
    }

    const construct_lattice = () => {
        // initialize
        let pos2r = {}, r2pos = {}, r2lattice={}, lattice2r={};

        for (let i = 0; i<attrs.length; i++) {
            pos2r[i] = {};
            for (let j=0; j<filter_threshold['num_feat']; j++) {
                pos2r[i][j] = [];
            }
        }
        // set position
        rules.forEach((conds, rid) => {
            let rule = conds['rules'].slice();
            // rule = rule.sort((a, b) => col_order[a['feature']] - col_order[b['feature']]);
            r2lattice[rid] = {};
            let parent = 0;
            rule.forEach((cond, cid) => {
                let lattice_node_id = find_lattice_node(parent, cond);
                r2lattice[rid][cid] = lattice_node_id;
                lattice2r[lattice_node_id] = [rid, cid]
                parent = lattice_node_id;
                if (!pos2r[col_order[cond['feature']]][cid].includes(lattice_node_id )) {
                    pos2r[col_order[cond['feature']]][cid].push(lattice_node_id);
                }
            });
        });

        // predicate ordering in each layer
        for (let ii = 0; ii < attrs.length; ii++) {
            let i = col_order[ii];
            for (let j = 0; j < Object.keys(pos2r[i]).length; j++) {
                let lat_node_order = generate_node_order_by_feature(ii, j, pos2r, true),
                    original_pos2r = pos2r[i][j].slice();

                for (let k = 0; k <  pos2r[i][j].length; k++) {
                    r2pos[original_pos2r[k]] = lat_node_order[k];
                    pos2r[i][j][lat_node_order[k]] = original_pos2r[k];
                }
            }
        }

        return [r2pos, pos2r, r2lattice, lattice2r];
    }

    const find_lattice_node = (parent, condition) => {
        let node_id = -1;
        lattice[parent]['children_id'].forEach((idx) => {
            let node = lattice[idx];
            if (condition['feature'] === node['feature'] && condition['sign'] === node['sign']) {
                if (condition['sign'] === 'range') {
                    if (condition['threshold0'] === node['threshold0'] && condition['threshold1'] === node['threshold1']){
                        node_id = node['node_id'];
                        return null;
                    }
                } else if (condition['threshold'] === node['threshold']){
                    node_id = node['node_id'];
                    return null;
                }
            }
        })
        return node_id;
    }

    const generate_node_order_by_feature = (feat_idx, cid, pos2r, ascending) => {
        let node_info = [], node_order = {}, th0, th1;

        for (let k = 0; k < pos2r[col_order[feat_idx]][cid].length; k++) {
            let node = lattice[pos2r[col_order[feat_idx]][cid][k]]
            if (ascending) {
                th0 = MAXINT;
                th1 = MAXINT;
            } else {
                th0 = -MAXINT;
                th1 = -MAXINT;
            }
            if (node['sign'] === 'range') {
                th0 = node['threshold0'];
                th1 = node['threshold1'];
            } else if (node['sign'] === '<=') {
                th1 = node['threshold'];
                th0 = real_min[feat_idx];
            } else if (node['sign'] === '>') {
                th0 = node['threshold'];
                th1 = real_max[feat_idx];
            }
            node_info.push({
                'idx': k,
                'th0': th0,
                'th1': th1,
            })
        }

        node_info.sort((a, b) => {
            if (a.th0 !== b.th0)
                return ascending ? a.th0 - b.th0 : b.th0 - a.th0;
            else if (a.th1 !== b.th1)
                return ascending ? a.th1 - b.th1 : b.th1 - a.th1;
            // else
            //   return pre_order[a.node_id].order - pre_order[b.node_id].order;
        });
        node_info.forEach((d, i) => node_order[d.idx] = i);

        return node_order;
    }

    const [r2pos, pos2r, r2lattice, lattice2r] = construct_lattice();

    const ref = renderD3(
        (svgref) => {

            // clearing
            clear_plot(svgref);

            const headerGroup = svgref
                .append("g");

            render_legend(headerGroup);
        })

            return (
        <Grid direction='column' container>
            <Box sx={{ width: '100%', maxHeight: 600}}>
                <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
                    <Tabs value={value} onChange={handleChange} aria-label="basic tabs">
                        <Tab label={<span className='tab-text'>Feature Aligned Tree</span>} {...a11yProps(0)} />
                        <Tab label={<span className='tab-text'>Text List</span>} {...a11yProps(1)}/>
                        <Tab label={<span className='tab-text'>Hierarchical List</span>} {...a11yProps(2)} />
                    </Tabs>
                </Box>
                <TabPanel value={value} index={0}>
                    <AlignedTree attrs={attrs} lattice={lattice}
                                 data_value={data_value}
                                 filter_threshold={filter_threshold}
                                 rules = {rules}
                                 col_order={col_order}
                                 real_min = {real_min}
                                 real_max = {real_max}
                                 node_info = {node_info}
                                 tot_size = {tot_size}
                                 target_names = {target_names}
                                 r2pos={r2pos} pos2r={pos2r}
                                 r2lattice={r2lattice} lattice2r={lattice2r}
                    />
                </TabPanel>
                <TabPanel value={value} index={1}>
                    <TextList rules={rules}
                              attrs={attrs}
                              lattice={lattice}
                              target_names = {target_names}
                              r2lattice={r2lattice}
                              data_value={data_value}
                              set_selected_rule={set_selected_rule}
                    />
                </TabPanel>
                <TabPanel value={value} index={2}>
                    <HierarchicalList ctx={ctx}
                        attrs={attrs} lattice={lattice}
                        filter_threshold={filter_threshold}
                        rules = {rules}
                        col_order={col_order}
                        tot_size = {tot_size}
                        preIndex = {preIndex}
                                      data_value={data_value}
                                      target_names = {target_names}
                        set_selected_rule={set_selected_rule}
                    />
                </TabPanel>
            </Box>
            <svg ref={ref} width={0} height={0}></svg>
            <Grid direction="row" justifyContent='flex-start' style={{marginLeft: 20}}>
                <Grid direction="column">
                    <RuleEditor attrs={attrs} filter_threshold={filter_threshold}
                                tot_size={tot_size} target_names={target_names}
                                data_value={data_value}
                                data={data}
                    />
                    <RuleSuggestion />
                </Grid>
            </Grid>
        </Grid>
    );
}

function mapStateToProps(state) {
    return {
        data_value: state.data_value,
    };
}

function mapDispatchToProps(dispatch) {
    return bindActionCreators(actions, dispatch)
}

export default connect(mapStateToProps, mapDispatchToProps)(SuRE);
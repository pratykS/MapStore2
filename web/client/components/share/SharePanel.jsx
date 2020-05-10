/*
 * Copyright 2016, GeoSolutions Sas.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree.
 */


import React from 'react';
import PropTypes from 'prop-types';
import Dialog from '../misc/Dialog';
import ShareSocials from './ShareSocials';
import ShareLink from './ShareLink';
import ShareEmbed from './ShareEmbed';
import ShareApi from './ShareApi';
import ShareQRCode from './ShareQRCode';
import {Glyphicon, Tabs, Tab, Checkbox, FormControl, FormGroup, ControlLabel} from 'react-bootstrap';
import Message from '../../components/I18N/Message';
import { join, isNil, reverse, values } from 'lodash';
import { removeQueryFromUrl, getSharedGeostoryUrl } from '../../utils/ShareUtils';
import SwitchPanel from '../misc/switch/SwitchPanel';
import Editor from '../data/identify/coordinates/Editor';
const {set} = require('../../utils/ImmutableUtils');

/**
 * SharePanel allow to share the current map in some different ways.
 * You can share it on socials networks(facebook,twitter,google+,linkedin)
 * copying the direct link
 * copying the embedded code
 * using the QR code with mobile apps
 * @class
 * @memberof components.share
 * @prop {boolean} [isVisible] display or hide
 * @prop {node} [title] the title of the page
 * @prop {string} [shareUrl] the url to use for share. by default location.href
 * @prop {string} [shareUrlRegex] reqular expression to parse the shareUrl to generate the final url, using shareUrlReplaceString
 * @prop {string} [shareUrlReplaceString] expression to be replaced by groups of the shareUrlRegex to get the final shareUrl to use for the iframe
 * @prop {boolean} [embedPanel=true] if false, hide the embed tab.
 * @prop {object} [embedOptions] options to pass to the embed tab.(`showTOCToggle` - if false hides the 'show TOC' checkbox (used only by map))
 * @prop {string} [shareApiUrl] url for share API part
 * @prop {string} [shareConfigUrl] the url of the config to use for shareAPI
 * @prop {function} [onClose] function to call on close window event.
 * @prop {getCount} [getCount] function used to get the count for social links.
 */
class SharePanel extends React.Component {
    static propTypes = {
        isVisible: PropTypes.bool,
        title: PropTypes.node,
        modal: PropTypes.bool,
        draggable: PropTypes.bool,
        sharedTitle: PropTypes.string,
        shareUrl: PropTypes.string,
        shareUrlRegex: PropTypes.string,
        shareUrlReplaceString: PropTypes.string,
        shareApiUrl: PropTypes.string,
        shareConfigUrl: PropTypes.string,
        embedPanel: PropTypes.bool,
        embedOptions: PropTypes.object,
        showAPI: PropTypes.bool,
        onClose: PropTypes.func,
        getCount: PropTypes.func,
        closeGlyph: PropTypes.string,
        version: PropTypes.string,
        bbox: PropTypes.object,
        advancedSettings: PropTypes.shape({
            bbox: PropTypes.bool,
            homeButton: PropTypes.bool,
            centerAndZoom: PropTypes.bool
        }),
        settings: PropTypes.object,
        onUpdateSettings: PropTypes.func,
        selectedTab: PropTypes.string,
        formatCoords: PropTypes.string,
        point: PropTypes.object
    };

    static defaultProps = {
        title: <Message msgId="share.titlePanel"/>,
        modal: false,
        draggable: true,
        onClose: () => {},
        shareUrlRegex: "(h[^#]*)#\\/viewer\\/([^\\/]*)\\/([A-Za-z0-9]*)",
        shareUrlReplaceString: "$1embedded.html#/$3",
        embedPanel: true,
        embedOptions: {},
        showAPI: true,
        closeGlyph: "1-close",
        settings: {},
        onUpdateSettings: () => {},
        formatCoords: "decimal"
    };

    state = {
        eventKey: 1,
        showAdvanced: true
    };

    UNSAFE_componentWillMount() {
        const tabs = {
            link: 1,
            social: 2,
            embed: 3
        };
        const bbox = join(this.props.bbox, ',');
        const coordinate = this.getCoordinates(this.props);
        this.setState({
            bbox,
            eventKey: tabs[this.props.selectedTab] || 1,
            zoom: this.props.zoom,
            coordinate
        });
    }

    UNSAFE_componentWillReceiveProps(newProps) {
        const newBbox = join(newProps.bbox, ',');
        if (this.props !== newProps) {
            const coordinate = this.getCoordinates(newProps);
            this.setState({
                bbox: newBbox,
                zoom: newProps.zoom,
                coordinate
            });
        }
    }


    getLatLng = (point) =>{
        const latlng = point && point.latlng || null;
        let lngCorrected = null;
        if (latlng) {
            lngCorrected = latlng && Math.round(latlng.lng * 100000000000000000) / 100000000000000000;
            lngCorrected = lngCorrected - 360 * Math.floor(lngCorrected / 360 + 0.5);
        }
        return { lat: latlng && latlng.lat, lon: lngCorrected};
    }

    getShareUrl = () => {
        const { settings, advancedSettings } = this.props;
        let shareUrl = getSharedGeostoryUrl(removeQueryFromUrl(this.props.shareUrl));
        if (settings.bboxEnabled && advancedSettings && advancedSettings.bbox && this.state.bbox) shareUrl = `${shareUrl}?bbox=${this.state.bbox}`;
        if (settings.showHome && advancedSettings && advancedSettings.homeButton) shareUrl = `${shareUrl}?showHome=true`;
        if (settings.centerAndZoomEnabled && advancedSettings && advancedSettings.centerAndZoom) {
            const centerOrMarker = reverse(values(this.state.coordinate)).join(',');
            if (settings.markerEnabled) {
                shareUrl = `${shareUrl}?marker=${centerOrMarker}&zoom=${this.state.zoom}`;
            } else {
                shareUrl = `${shareUrl}?center=${centerOrMarker}&zoom=${this.state.zoom}`;
            }
        }
        return shareUrl;
    };

    generateUrl = (orig = location.href, pattern, replaceString) => {
        let regexp = new RegExp(pattern);
        if (orig.match(regexp)) {
            return orig.replace(regexp, replaceString);
        }
        return orig;
    };

    render() {
        // ************************ CHANGE URL PARAMETER FOR EMBED CODE ****************************
        /* if the property shareUrl is not defined it takes the url from location.href */
        const cleanShareUrl = this.getShareUrl();
        const shareUrl = cleanShareUrl || location.href;
        let shareEmbeddedUrl = cleanShareUrl || location.href;
        if (this.props.shareUrlRegex && this.props.shareUrlReplaceString) {
            shareEmbeddedUrl = this.generateUrl(shareEmbeddedUrl, this.props.shareUrlRegex, this.props.shareUrlReplaceString);
        }
        const currentTab = !this.props.embedPanel && this.state.eventKey === 3 ? 1 : this.state.eventKey; // fallback to tab link if embed is disabled and selected at the same time
        const shareApiUrl = this.props.shareApiUrl || cleanShareUrl || location.href;
        const social = <ShareSocials sharedTitle={this.props.sharedTitle} shareUrl={shareUrl} getCount={this.props.getCount}/>;
        const direct = <div><ShareLink shareUrl={shareUrl} bbox={this.props.bbox}/><ShareQRCode shareUrl={shareUrl}/></div>;
        const code = (<div><ShareEmbed shareUrl={shareEmbeddedUrl} {...this.props.embedOptions} />
            {this.props.showAPI ? <ShareApi baseUrl={shareApiUrl} shareUrl={shareUrl} shareConfigUrl={this.props.shareConfigUrl} version={this.props.version}/> : null}</div>);

        const tabs = (<Tabs defaultActiveKey={currentTab} id="sharePanel-tabs" onSelect={(eventKey) => this.setState({ eventKey })}>
            <Tab eventKey={1} title={<Message msgId="share.direct" />}>{currentTab === 1 && direct}</Tab>
            <Tab eventKey={2} title={<Message msgId="share.social" />}>{currentTab === 2 && social}</Tab>
            {this.props.embedPanel ? <Tab eventKey={3} title={<Message msgId="share.code" />}>{currentTab === 3 && code}</Tab> : null}
        </Tabs>);
        let sharePanel =
            (<Dialog
                id={this.props.modal ? "share-panel-dialog-modal" : "share-panel-dialog"}
                className="modal-dialog modal-content share-win"
                modal={this.props.modal}
                draggable={this.props.draggable}
                style={{zIndex: 1993}}>
                <span role="header">
                    <span className="share-panel-title">
                        <Message msgId="share.title"/>
                    </span>
                    <button onClick={this.props.onClose} className="share-panel-close close">
                        {this.props.closeGlyph ? <Glyphicon glyph={this.props.closeGlyph}/> : <span>×</span>}
                    </button>
                </span>
                <div role="body" className="share-panels">
                    {tabs}
                    {this.props.advancedSettings && this.renderAdvancedSettings()}
                </div>
            </Dialog>);

        return this.props.isVisible ? sharePanel : null;
    }

    getCoordinates = (props) => {
        const latLng = this.getLatLng(props.point);
        const {x, y} = props.center || {x: "", y: ""};
        return latLng && latLng.lat !== null ? latLng : {lat: y, lon: x} || {lat: "", lon: ""};
    }

    renderAdvancedSettings = () => {
        return (
            <SwitchPanel
                title={<Message msgId="share.advancedOptions"/>}
                expanded={this.state.showAdvanced}
                onSwitch={() => this.setState({ showAdvanced: !this.state.showAdvanced })}>
                {this.props.advancedSettings.bbox && <Checkbox
                    checked={this.props.settings.bboxEnabled}
                    onChange={() =>
                        this.props.onUpdateSettings({
                            ...this.props.settings,
                            bboxEnabled: !this.props.settings.bboxEnabled,
                            centerAndZoomEnabled: false
                        })}>
                    <Message msgId="share.addBboxParam" />
                </Checkbox>}
                {this.props.advancedSettings.centerAndZoom && <Checkbox
                    checked={this.props.settings && this.props.settings.centerAndZoomEnabled}
                    onChange={() => {
                        this.props.identifyDisable();
                        this.props.onUpdateSettings({
                            ...this.props.settings,
                            centerAndZoomEnabled: !this.props.settings.centerAndZoomEnabled,
                            bboxEnabled: false
                        });
                    }
                    }>
                    <Message msgId="share.addCenterAndZoomParam" />
                </Checkbox>}
                {this.props.advancedSettings.homeButton && <Checkbox
                    checked={this.props.settings.showHome}
                    onChange={() =>
                        this.props.onUpdateSettings({
                            ...this.props.settings,
                            showHome: !this.props.settings.showHome
                        })}>
                    <Message msgId="share.showHomeButton" />
                </Checkbox>}
                {this.props.settings.centerAndZoomEnabled && <div>
                    <FormGroup id={"share-container"}>
                        <ControlLabel><Message msgId="share.coordinate" /></ControlLabel>
                        <Editor
                            removeVisible={false}
                            formatCoord={this.props.formatCoords}
                            coordinate={this.state.coordinate}
                            onSubmit={(val)=>{
                                const lat = !isNil(val.lat) && !isNaN(val.lat) ? parseFloat(val.lat) : 0;
                                const lng = !isNil(val.lon) && !isNaN(val.lon) ? parseFloat(val.lon) : 0;
                                let newPoint = set('latlng.lng', lng, set('latlng.lat', lat, this.props.point));
                                this.props.onSubmitClickPoint(newPoint);
                            }}
                            onChangeFormat={this.props.onChangeFormat}
                        />
                    </FormGroup>
                    <FormGroup>
                        <ControlLabel><Message msgId="share.zoom" /></ControlLabel>
                        <FormControl
                            type="number"
                            min={1}
                            max={35}
                            name={"zoom"}
                            value={this.state.zoom || this.props.zoom || 21}
                            onChange={(event)=>this.setState({...this.state, zoom: event.target.value})}/>
                    </FormGroup>
                    <Checkbox
                        checked={this.props.settings && this.props.settings.markerEnabled}
                        onChange={() => {
                            this.props.onUpdateSettings({
                                ...this.props.settings,
                                markerEnabled: !this.props.settings.markerEnabled
                            });
                        }
                        }>
                        <Message msgId="share.marker" />
                    </Checkbox>
                </div>
                }
            </SwitchPanel>
        );
    }
}

export default SharePanel;

/*
 * Copyright 2019, GeoSolutions Sas.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { Observable } from 'rxjs';
import { get, pick, omit, isObject, isString, isArray, find, cloneDeep } from 'lodash';

import MapUtils from '../utils/MapUtils';
import Api from '../api/GeoStoreDAO';
import { error as showError } from '../actions/notifications';
import { isLoggedIn } from '../selectors/security';
import { setTemplates, setMapTemplatesLoaded, setTemplateData, setTemplateLoading, CLEAR_MAP_TEMPLATES, OPEN_MAP_TEMPLATES_PANEL,
    MERGE_TEMPLATE, REPLACE_TEMPLATE } from '../actions/maptemplates';
import { templatesSelector, mapTemplatesLoadedSelector } from '../selectors/maptemplates';
import { templatesSelector as contextTemplatesSelector } from '../selectors/context';
import { mapSelector } from '../selectors/map';
import { layersSelector, groupsSelector } from '../selectors/layers';
import { backgroundListSelector } from '../selectors/backgroundselector';
import { textSearchConfigSelector } from '../selectors/searchconfig';
import { mapOptionsToSaveSelector } from '../selectors/mapsave';
import { setControlProperty } from '../actions/controls';
import { configureMap } from '../actions/config';
import { wrapStartStop } from '../observables/epics';
import { toMapConfig } from '../utils/ogc/WMC';

const errorToMessageId = (e = {}, getState = () => {}) => {
    let message = `context.errors.template.unknownError`;
    if (e.status === 403) {
        message = `context.errors.template.pleaseLogin`;
        if (isLoggedIn(getState())) {
            message = `context.errors.template.notAccessible`;
        }
    } if (e.status === 404) {
        message = `context.errors.template.notFound`;
    }
    return message;
};

export const clearMapTemplatesEpic = (action$) => action$
    .ofType(CLEAR_MAP_TEMPLATES)
    .switchMap(() => Observable.of(setControlProperty('mapTemplates', 'enabled', false, false)));

export const openMapTemplatesPanelEpic = (action$, store) => action$
    .ofType(OPEN_MAP_TEMPLATES_PANEL)
    .switchMap(() => {
        const state = store.getState();
        const contextTemplates = contextTemplatesSelector(state);
        const mapTemplatesLoaded = mapTemplatesLoadedSelector(state);

        const makeFilter = () => ({
            OR: {
                FIELD: contextTemplates.map(template => ({
                    field: ['ID'],
                    operator: ['EQUAL_TO'],
                    value: [template.id]
                }))
            }
        });

        const extractThumbnail = (resource) => {
            const attribute = get(resource, 'Attributes.attribute', {});
            const attributes = isArray(attribute) ? attribute : [attribute];
            return get(find(attributes, ({name}) => name === 'thumbnail'), 'value');
        };

        return Observable.of(setControlProperty('mapTemplates', 'enabled', true, true)).concat(!mapTemplatesLoaded ?
            (contextTemplates.length > 0 ? Observable.defer(() => Api.searchListByAttributes(makeFilter(), {
                params: {
                    includeAttributes: false
                }
            }, '/resources/search/list')) : Observable.of({}))
                .switchMap((data) => {
                    const resourceObj = get(data, 'ResourceList.Resource', []);
                    const resources = isArray(resourceObj) ? resourceObj : [resourceObj];
                    const newTemplates = resources.map(resource => ({
                        ...pick(resource, 'id', 'name', 'description'),
                        thumbnail: extractThumbnail(resource),
                        dataLoaded: false,
                        loading: false
                    }));
                    return Observable.of(setTemplates(newTemplates), setMapTemplatesLoaded(true));
                })
                .catch(err => Observable.of(setMapTemplatesLoaded(true, err))) :
            Observable.empty()
        );
    });

export const mergeTemplateEpic = (action$, store) => action$
    .ofType(MERGE_TEMPLATE)
    .switchMap(({id}) => {
        const state = store.getState();
        const templates = templatesSelector(state);
        const template = find(templates, t => t.id === id);

        return (template.dataLoaded ? Observable.of(template.data) :
            Observable.defer(() => Api.getData(id))).switchMap(data => {
            if (isObject(data) && data.map !== undefined || isString(data)) {
                const map = mapSelector(state);
                const layers = layersSelector(state);
                const groups = groupsSelector(state);
                const backgrounds = backgroundListSelector(state);
                const textSearchConfig = textSearchConfigSelector(state);
                const additionalOptions = mapOptionsToSaveSelector(state);

                const currentConfig = MapUtils.saveMapConfiguration(map, layers, groups, backgrounds, textSearchConfig, additionalOptions);

                return (isString(data) ? Observable.defer(() => toMapConfig(data, true)) : Observable.of(data))
                    .switchMap(config => Observable.of(
                        ...(!template.dataLoaded ? [setTemplateData(id, data)] : []),
                        configureMap(cloneDeep(omit(MapUtils.mergeMapConfigs(currentConfig, config), 'widgetsConfig')), null)
                    ));
            }

            return !template.dataLoaded ? Observable.of(setTemplateData(id, data)) : Observable.empty();
        }).let(wrapStartStop(
            setTemplateLoading(id, true),
            setTemplateLoading(id, false),
            e => {
                const messageId = errorToMessageId(e.originalError || e, store.getState);
                return Observable.of(showError({
                    title: 'context.errors.template.title',
                    message: messageId,
                    position: "tc",
                    autoDismiss: 5
                }));
            }
        ));
    });

export const replaceTemplateEpic = (action$, store) => action$
    .ofType(REPLACE_TEMPLATE)
    .switchMap(({id}) => {
        const state = store.getState();
        const templates = templatesSelector(state);
        const template = find(templates, t => t.id === id);
        const {zoom, center} = mapSelector(state);

        return (template.dataLoaded ? Observable.of(template.data) : Observable.defer(() => Api.getData(id)))
            .switchMap(data => (isString(data) ?
                Observable.defer(() => toMapConfig(data)) :
                Observable.of(isObject(data) && data.map !== undefined ? data : null))
                .switchMap(config => Observable.of(
                    ...(!template.dataLoaded ? [setTemplateData(id, data)] : []),
                    ...(config ? [
                        configureMap(cloneDeep({
                            ...config,
                            map: {
                                ...config.map,

                                // if no zoom or center provided keep the current ones
                                zoom: config.map.zoom || zoom,
                                center: config.map.center || center
                            }
                        }), null, !config.map.zoom && (config.map.bbox || config.map.maxExtent))
                    ] : []))))
            .let(wrapStartStop(
                setTemplateLoading(id, true),
                setTemplateLoading(id, false),
                e => {
                    const messageId = errorToMessageId(e.originalError || e, store.getState);
                    return Observable.of(showError({
                        title: 'context.errors.template.title',
                        message: messageId,
                        position: "tc",
                        autoDismiss: 5
                    }));
                }
            ));
    });

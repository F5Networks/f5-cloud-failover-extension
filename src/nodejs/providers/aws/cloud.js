/**
 * Copyright 2021 F5 Networks, Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

'use strict';

const aws4 = require('aws4');
const { parse } = require('cruftless')();
const IPAddressLib = require('ip-address');
const https = require('https');
const fs = require('fs');
const url = require('url');
const util = require('../../util');
const AbstractCloud = require('../abstract/cloud').AbstractCloud;
const constants = require('../../constants');

const CLOUD_PROVIDERS = constants.CLOUD_PROVIDERS;
const INSPECT_ADDRESSES_AND_ROUTES = constants.INSPECT_ADDRESSES_AND_ROUTES;
const API_VERSION_EC2 = constants.API_VERSION_EC2;
const XML_TEMPLATES = constants.XML_TEMPLATES.AWS;

class Cloud extends AbstractCloud {
    constructor(options) {
        super(CLOUD_PROVIDERS.AWS, options);

        this.s3FilePrefix = constants.STORAGE_FOLDER_NAME;
        this._sessionToken = null;
        this._credentials = null;
        this._httpOptions = null;
        this.s3_host = null;
        this.s3BucketName = null;
        this.s3BucketRegion = null;
        this.ec2_host = null;
        this.proxyOptions = null;
    }

    /**
    * See the parent class method for details
    */
    init(options) {
        super.init(options);

        return this._fetchMetadataSessionToken()
            .then(() => this._getCredentials())
            .then(() => this._getInstanceIdentityDoc())
            .then((metadata) => {
                this.region = metadata.region;
                this.s3_host = `s3.${this.region}.amazonaws.com`;
                this.ec2_host = `ec2.${this.region}.amazonaws.com`;
                this.instanceId = metadata.instanceId;
                this.customerId = metadata.accountId;

                if (this.proxySettings) {
                    const opts = url.parse(this._formatProxyUrl(this.proxySettings));
                    this.proxyOptions = {
                        protocol: opts.protocol,
                        host: opts.hostname,
                        port: opts.port
                    };
                    if (opts.username && opts.password) {
                        this.proxyOptions.auth = {};
                        this.proxyOptions.auth.username = opts.username;
                        this.proxyOptions.auth.password = opts.password;
                    }
                }

                const agentOpts = {};
                if (this.trustedCertBundle) {
                    if (fs.existsSync(this.trustedCertBundle)) {
                        const certs = fs.readFileSync(this.trustedCertBundle);
                        agentOpts.rejectUnauthorized = true;
                        agentOpts.ca = certs;
                    }
                }
                this._httpOptions = new https.Agent(agentOpts);

                if (this.storageName) {
                    return this._getBucketRegion(this.storageName);
                }
                return this._getS3BucketByTags(this.storageTags);
            })
            .then((bucket) => {
                this.s3BucketName = bucket.name;
                this.s3BucketRegion = bucket.region;
                this.logger.silly('Cloud Provider initialization complete');
            })
            .catch((err) => Promise.reject(err));
    }

    /**
     * Fetches IMDSv2 session token
     */
    _fetchMetadataSessionToken() {
        return util.makeRequest(constants.METADATA_HOST, '/latest/api/token', {
            method: 'PUT',
            protocol: 'http',
            port: 80,
            headers: {
                'X-aws-ec2-metadata-token-ttl-seconds': '3600'
            }
        })
            .then((response) => { this._sessionToken = response; })
            .catch((err) => Promise.reject(err));
    }

    /**
    * Returns region name (cloud)
    *
    *
    * @returns {Promise}
    */
    getRegion() {
        return this.region;
    }

    /**
    * Get credentials from metadata
    *
    * @returns {Promise} A promise which is resolved with credentials
    *
    */
    _getCredentials() {
        const host = constants.METADATA_HOST;
        const options = {
            protocol: 'http',
            port: 80,
            headers: {
                'x-aws-ec2-metadata-token': this._sessionToken
            }
        };

        return util.makeRequest(host, '/latest/meta-data/iam/security-credentials/', options)
            .then((instanceProfileResponse) => util.makeRequest(
                host,
                `/latest/meta-data/iam/security-credentials/${instanceProfileResponse}`,
                options
            ))
            .then((credentialsResponse) => {
                this._credentials = {
                    accessKeyId: credentialsResponse.AccessKeyId,
                    secretAccessKey: credentialsResponse.SecretAccessKey,
                    sessionToken: credentialsResponse.Token
                };
            })
            .catch((err) => Promise.reject(err));
    }

    /**
     * Fetches IMDSv2 session token, if not this._sessionToken
     * Then gets credentials from metadata, if not this._credentials
     *
     * @param {String}  host                      - HTTP host
     * @param {String}  path                      - HTTP uri and query string
     * @param {Object}  [headers]         - HTTP headers to sign
     *
     * @returns {Object} All headers, including AWS Signature V4 requirements, for a specific request
     *
     */
    _getAuthHeaders(options) {
        return Promise.resolve()
            .then(() => (this._sessionToken
                ? Promise.resolve()
                : this._fetchMetadataSessionToken()
            ))
            .then(() => (this._credentials
                ? Promise.resolve()
                : this._getCredentials()
            ))
            .then(() => aws4.sign(options, this._credentials).headers)
            .catch((err) => Promise.reject(err));
    }

    /**
     * Sends HTTP request
    *
    * @param {String}  host                      - HTTP host
    * @param {String}  uri                       - HTTP uri
    * @param {Object}  options                   - function options
    * @param {String}  [options.region]          - AWS region
    * @param {String}  [options.service]         - AWS service
    * @param {String}  [options.method]          - HTTP method
    * @param {String}  [options.protocol]        - HTTP protocol
    * @param {Integer} [options.port]            - HTTP port
    * @param {Object}  [options.queryParams]     - HTTP query parameters
    * @param {String}  [options.body]            - HTTP body
    * @param {Object}  [options.formData]        - HTTP form data
    * @param {Object}  [options.headers]         - HTTP headers
    * @param {Boolean} [options.continueOnError] - continue on error (return info even if response contains error code)
    * @param {Boolean} [options.advancedReturn]  - advanced return (return status code AND response body)
    *
    * @returns {Promise} Resolves a response for a request
    */
    makeRequest(host, uri, options) {
        options = options || {};
        options.headers = options.headers || {};
        options.queryParams = options.queryParams || {};
        options.proxy = this.proxyOptions;
        let path = '';
        Object.keys(options.queryParams).forEach((key) => {
            path += path === '' ? '' : '&';
            path += `${key}=${options.queryParams[key]}`;
        });
        path = path === '' ? uri : `${uri}?${path}`;
        const authArgs = {
            host,
            path,
            service: host.match(/s3/) ? 's3' : 'ec2',
            region: options.region || this.region,
            method: options.method || 'GET',
            headers: options.headers || {},
            body: options.body || ''
        };

        return this._getAuthHeaders(authArgs)
            .then((headers) => {
                options.headers = headers;
                options.httpsAgent = this._httpOptions;
                return util.makeRequest(host, uri, options);
            })
            .catch((err) => Promise.reject(err));
    }

    /**
     * Sends EC2 API HTTP request
    *
    * @param {Object}  options               - function options
    * @param {String}  [options.region]      - AWS region
    * @param {String}  [options.service]     - AWS service
    * @param {String}  [options.host]        - HTTP host
    * @param {Object}  [options.queryParams] - HTTP query parameters
    * @param {String}  [template]            - XML template for conversion into JSON
    *
    * @returns {Promise} A promise which will be resolved once function resolves
    */
    ec2ApiRequest(options) {
        options.region = options.region || this.region;
        options.queryParams.Version = options.queryParams.Version || API_VERSION_EC2;
        const host = options.host || this.ec2_host || constants.API_HOST_EC2;

        const makeEc2Request = (_options) => this.makeRequest(host, '/', _options)
            .then((response) => {
                const tmpl = parse(XML_TEMPLATES[_options.queryParams.Action]);
                return tmpl.fromXML(response) || {};
            })
            .catch((err) => Promise.reject(err));

        return this._retrier(makeEc2Request, [options]);
    }

    /**
     * Sends EC2 API HTTP request
    *
    * @param {Object}  queryParams           - request queryParams
    * @param {String}  [queryParams.Action]  - EC2 API Action
    *
    * @returns {Boolean} Returns response after request
    */
    makeBooleanEc2Request(queryParams) {
        queryParams.Version = API_VERSION_EC2;
        const options = {
            region: this.region,
            queryParams
        };
        return this.makeRequest(this.ec2_host || constants.API_HOST_EC2, '/', options)
            .catch((err) => Promise.reject(err));
    }

    /**
    * Upload data to storage (cloud)
    *
    * @param {Object} fileName - file name where data should be uploaded
    * @param {Object} data     - data to upload
    *
    * @returns {Promise}
    */
    uploadDataToStorage(fileName, data) {
        const s3Key = `${this.s3FilePrefix}/${fileName}`;
        this.logger.silly(`Uploading data to ${this.s3BucketName}: ${s3Key}`);

        const uploadObject = () => new Promise((resolve, reject) => {
            const host = `${this.s3BucketName}.s3.${this.s3BucketRegion}.amazonaws.com`;
            const options = {
                method: 'PUT',
                headers: {},
                body: util.stringify(data),
                region: this.s3BucketRegion
            };
            if (this.storageEncryption
            && this.storageEncryption.serverSide
            && this.storageEncryption.serverSide.enabled) {
                options.headers['x-amz-server-side-encryption'] = this.storageEncryption.serverSide.algorithm;
                if (this.storageEncryption.serverSide.keyId) {
                    options.headers['x-amz-server-side-encryption-aws-kms-key-id'] = this.storageEncryption.serverSide.keyId;
                }
            }
            this.makeRequest(host, `/${s3Key}`, options)
                .then(() => resolve())
                .catch((err) => reject(err));
        });

        return this._retrier(uploadObject, []);
    }

    /**
    * Download data from storage (cloud)
    *
    * @param {Object} fileName - file name where data should be downloaded
    *
    * @returns {Promise}
    */
    downloadDataFromStorage(fileName) {
        const s3Key = `${this.s3FilePrefix}/${fileName}`;
        this.logger.silly(`Downloading data from ${this.s3BucketName}: ${s3Key}`);
        const host = `${this.s3BucketName}.s3.${this.s3BucketRegion}.amazonaws.com`;
        const options = {
            queryParams: {
                'list-type': 2,
                Bucket: this.s3BucketName,
                Prefix: s3Key
            },
            region: this.s3BucketRegion
        };
        const downloadObject = () => new Promise((resolve, reject) => {
            // check if the object exists first, if not return an empty object
            this.makeRequest(host, '/', options)
                .then((data) => {
                    const template = parse('<ListBucketResult><Contents><Key>{{Key}}</Key></Contents></ListBucketResult>');
                    const Key = template.fromXML(data).Key || null;
                    if (Key && Key.match(s3Key)) {
                        return this.makeRequest(host, `/${s3Key}`, { region: this.s3BucketRegion });
                    }
                    return Promise.resolve({});
                })
                .then((response) => resolve(response))
                .catch((err) => reject(err));
        });

        return this._retrier(downloadObject, []);
    }

    /**
    * Update Addresses - Updates the public ip(s) on the BIG-IP Cluster, by re-associating Elastic IP Addresses
    *
    * @param {Object} options                     - function options
    * @param {Object} [options.localAddresses]    - object containing local (self) addresses [ '192.0.2.1' ]
    * @param {Object} [options.failoverAddresses] - object containing failover addresses [ '192.0.2.1' ]
    * @param {Object} [options.updateOperations]  - skip discovery and perform 'these' update operations
    *
    * @returns {Object}
    */
    updateAddresses(options) {
        options = options || {};
        const localAddresses = options.localAddresses || [];
        const failoverAddresses = options.failoverAddresses || [];
        const updateOperations = options.updateOperations;

        this.logger.silly('updateAddresses: ', options);

        // update only logic
        if (updateOperations) {
            return this._updateAddresses(updateOperations)
                .catch((err) => Promise.reject(err));
        }
        // default - discover and update
        return this._discoverAddressOperations(localAddresses, failoverAddresses)
            .then((operations) => this._updateAddresses(operations))
            .catch((err) => Promise.reject(err));
    }

    /**
     * Discover Addresses - discovers addresses
     *
     * @param {Object} options                     - function options
     * @param {Object} [options.localAddresses]    - object containing local (self) addresses [ '192.0.2.1' ]
     * @param {Object} [options.failoverAddresses] - object containing failover addresses [ '192.0.2.1' ]
     *
     * @returns {Object}
     */
    discoverAddresses(options) {
        options = options || {};
        const localAddresses = options.localAddresses || [];
        const failoverAddresses = options.failoverAddresses || [];
        this.logger.silly('discoverAddresses: ', options);
        return this._discoverAddressOperations(localAddresses, failoverAddresses)
            .catch((err) => Promise.reject(err));
    }

    /**
     * Discover addresses using provided definitions
     *
     * @param {Object}                         - local addresses, failover addresses
     * @param {Object} addressGroupDefinitions - provides definition used for fetching addresses from AWS cloud
     * @param {Object} options                 - function options
     *
     * @returns {Object} updateActions
     */
    discoverAddressOperationsUsingDefinitions(addresses, addressGroupDefinitions, options) {
        this.logger.silly(`discoverAddressOperationsUsingDefinitions: addresses: ${JSON.stringify(addresses)}`);
        this.logger.silly(`discoverAddressOperationsUsingDefinitions: addressGroupDefinitions: ${JSON.stringify(addressGroupDefinitions)}`);
        this.logger.silly(`discoverAddressOperationsUsingDefinitions: options: ${JSON.stringify(options)}`);
        const resultAction = {
            publicAddresses: {},
            interfaces: {
                disassociate: [],
                associate: []
            },
            loadBalancerAddresses: {}
        };
        const promises = [];
        if (addressGroupDefinitions[0].type === 'networkInterfaceAddress') {
            this.logger.silly('aws-discoverAddressOperationsUsingDefinitions: handling addressGroupDefinitions for same-net');
            promises.push(this._createActionsForAddressAssociationDisassociation(addresses, addressGroupDefinitions));
        } else {
            this.logger.silly('aws-discoverAddressOperationsUsingDefinitions: handling addressGroupDefinitions for across-net');
            addressGroupDefinitions.forEach((item) => {
                promises.push(this._createActionForElasticIpAddress(resultAction, item));
            });
        }

        return Promise.all(promises)
            .then((response) => response.pop())
            .catch((err) => Promise.reject(err));
    }

    /**
     * Create operations for Elastic IP Address for across-net deployment
     *
     * @param {Object} resultAction     - publicAddresses operations
     * @param {Object} providedAddress  - virtual addresses and scoping address
     *
     * @returns {Object} updateActions  - A promise resolved resultAction or rejects
     */
    _createActionForElasticIpAddress(resultAction, providedAddress) {
        if (providedAddress.vipAddresses === undefined || providedAddress.vipAddresses.length !== 2) {
            this.logger.silly('Provided address group definition does not provide correct number of vip addresses; 2 vip addreses must be provided.');
            return Promise.resolve(resultAction);
        }
        let publicIpAddress;
        return this._getElasticIPs({ publicAddress: providedAddress.scopingAddress })
            .then((response) => {
                if (!response) {
                    this.logger.warning('Elastic ip was not found. Make sure declaration provides correct public ip');
                    return Promise.resolve(resultAction);
                }

                if (response.Addresses === undefined || response.Addresses.length === 0) {
                    this.logger.warning('Response does not have addresses. Make sure declaration provides correct public ip under failoverAddresses.addressGroupDefinitions.');
                    return Promise.resolve(resultAction);
                }

                publicIpAddress = response.Addresses[0].PublicIp;
                let params = {
                    Filters: []
                };

                if (response.Addresses[0].PrivateIpAddress === undefined) {
                    this.logger.warning(`Recieved address does not have PrivateAddress association: ${util.stringify(response.Addresses[0])}`);
                    return Promise.resolve(resultAction);
                }

                if (providedAddress.vipAddresses.indexOf(response.Addresses[0].PrivateIpAddress) === -1) {
                    this.logger.warning('Private addresses associated with public ip is not in provided list of VIP Addresses. Make sure declaration includes correct VIP addresses under failoverAddresses.addressGroupDefinitions.');
                    return Promise.resolve(resultAction);
                }
                providedAddress.vipAddresses.forEach((privateAddress) => {
                    if (privateAddress !== response.Addresses[0].PrivateIpAddress) {
                        resultAction.publicAddresses[publicIpAddress] = {
                            current: {
                                PrivateIpAddress: response.Addresses[0].PrivateIpAddress,
                                AssociationId: response.Addresses[0].AssociationId
                            },
                            target: {
                                PrivateIpAddress: privateAddress,
                                NetworkInterfaceId: 'to-set'
                            },
                            AllocationId: response.Addresses[0].AllocationId
                        };
                        params = this._addFilterToParams(params, 'addresses.private-ip-address', privateAddress);
                        Object.keys(this.addressTags).forEach((tagKey) => {
                            params = this._addFilterToParams(params, `tag:${tagKey}`, this.addressTags[tagKey]);
                        });
                    }
                });
                return this._describeNetworkInterfaces(params);
            })
            .then((response) => {
                if (response.NetworkInterfaces === undefined || response.NetworkInterfaces.length !== 1) {
                    this.logger.warning('Problem with fetching network interface metadata. Make sure declaration includes correct VIP addresses under failoverAddresses.addressGroupDefinitions as well as network intefaces are tagged correctly.');
                    return Promise.resolve(resultAction);
                }
                resultAction.publicAddresses[publicIpAddress]
                    .target.NetworkInterfaceId = response.NetworkInterfaces[0].NetworkInterfaceId;
                return Promise.resolve(resultAction);
            })
            .catch((err) => Promise.reject(err));
    }

    /**
     * Create operations for associate and dissassociate address for same-net deployment
     *
     * @param {Object} addresses                - local addresses, virtual addresses
     * @param {Object} addressGroupDefinitions  - address group definitions
     *
     * @returns {Object}                        - A promise resolved publicAddresses and interfaces
     */
    _createActionsForAddressAssociationDisassociation(addresses, addressGroupDefinitions) {
        const operations = {
            disassociate: [],
            associate: []
        };
        const scopingAddresses = [];
        addressGroupDefinitions.forEach((address) => {
            scopingAddresses.push(address.scopingAddress);
        });
        this.logger.silly('_createActionsForAddressAssociationDisassociation generated scoping addresses', scopingAddresses);
        return Promise.all([
            this._listNics({ tags: this.addressTags }),
            this._getSubnets()
        ])
            .then((results) => {
                const nics = results[0];
                const parsedNics = this._parseNics(nics, addresses.localAddresses);
                for (let s = parsedNics.mine.length - 1; s >= 0; s -= 1) {
                    for (let h = parsedNics.theirs.length - 1; h >= 0; h -= 1) {
                        const theirNic = parsedNics.theirs[h].nic;
                        const myNic = parsedNics.mine[s].nic;
                        if ((theirNic.SubnetId === undefined || myNic.SubnetId === undefined)
                        || (theirNic.SubnetId !== myNic.SubnetId)) {
                            this.logger.silly('subnetID does not exist or does not match for interfaces', myNic.NetworkInterfaceId, theirNic.NetworkInterfaceId);
                        } else {
                            const nicOperations = this._checkForNicOperations(myNic, theirNic, scopingAddresses);
                            if (nicOperations.disassociate && nicOperations.associate) {
                                operations.disassociate.push(nicOperations.disassociate);
                                operations.associate.push(nicOperations.associate);
                            }
                        }
                    }
                }
                this.logger.silly('_createActionsForAddressAssociationDisassociation generated address operations', operations);
                return Promise.resolve({
                    publicAddresses: {},
                    interfaces: operations,
                    loadBalancerAddresses: {}
                });
            })
            .catch((err) => Promise.reject(err));
    }

    /**
     * Get Associated Address and Route Info - Returns associated and route table information
     *
     * @param {Boolean} isAddressOperationsEnabled   - Are we inspecting addresses
     * @param {Boolean} isRouteOperationsEnabled     - Are we inspecting routes
     *
     * @returns {Object}
     */
    getAssociatedAddressAndRouteInfo(isAddressOperationsEnabled, isRouteOperationsEnabled) {
        const data = util.deepCopy(INSPECT_ADDRESSES_AND_ROUTES);
        data.instance = this.instanceId;
        const params = this._addFilterToParams({}, 'instance-id', this.instanceId);
        return this._describeInstance(params)
            .then((instance) => {
                if (isAddressOperationsEnabled) {
                    instance.Reservations[0].Instances[0].NetworkInterfaces.forEach((nic) => {
                        nic.PrivateIpAddresses.forEach((address) => {
                            data.addresses.push({
                                publicIpAddress: address.Association ? address.Association.PublicIp : '',
                                privateIpAddress: address.PrivateIpAddress,
                                networkInterfaceId: nic.NetworkInterfaceId
                            });
                        });
                    });
                }
                return isRouteOperationsEnabled ? this._getRouteTables({ instanceId: this.instanceId }) : [];
            })
            .then((routeTables) => {
                routeTables.forEach((route) => {
                    data.routes.push({
                        routeTableId: route.RouteTableId,
                        routeTableName: null, // add routeTableName here to normalize response across clouds
                        networkId: route.VpcId
                    });
                });
                return Promise.resolve(data);
            })
            .catch((err) => Promise.reject(err));
    }

    /**
     * Add filter to parameters
     *
     * @param {Object} params      - parameters object
     * @param {String} filterName  - name to filter on
     * @param {String} filterValue - value to filter on
     *
     * @returns {Object} - Modified parameters object
     */
    _addFilterToParams(params, filterName, filterValue) {
        params = params || {};
        if (!params.Filters) {
            params.Filters = [];
        }

        if (Array.isArray(filterValue)) {
            params.Filters.push(
                {
                    Name: filterName,
                    Values: filterValue
                }
            );
        } else {
            params.Filters.push(
                {
                    Name: filterName,
                    Values: [
                        filterValue
                    ]
                }
            );
        }

        return params;
    }

    /**
     * Convert filter object to query parameters
     *
     * @param {Object} params      - filter object
     * @param {String} filterName  - name to filter on
     * @param {Array} filterValues - array of values to filter on
     * @param {Object} queryParams - existing query parameters to push filters into
     *
     * @returns {Object} - Updated query parameters object
     */
    _addFiltersToQueryParams(params, queryParams) {
        queryParams = queryParams || {};
        params = params || {};
        if (!params.Filters) {
            params.Filters = [];
        }

        let ctrFilter = 0;
        Object.keys(params.Filters).forEach((key) => {
            ctrFilter += 1;
            queryParams[`Filter.${ctrFilter}.Name`] = params.Filters[key].Name;

            let ctrVal = 0;
            params.Filters[key].Values.forEach((val) => {
                ctrVal += 1;
                const index = params.Filters[key].Values.length > 1
                    ? `Filter.${ctrFilter}.Value.${ctrVal}`
                    : `Filter.${ctrFilter}.Value`;
                queryParams[index] = val;
            });
        });

        return queryParams;
    }

    /**
    * Discover address operations, supports multiple topologies
    *
    * Topology differences:
    * - Same Network: Assumes a private address should be moved, along with any
    * cooresponding public address (since the private address "floats" between NICs)
    * - Across Network: Assumes a public address should be reassociated to a different
    * private address (since the NICs are in different networks)
    *
    * @param {Object} localAddresses    - local addresses
    * @param {Object} failoverAddresses - failover addresses
    *
    * @returns {Promise} resolved with a list of update operations
    *                   {
    *                       'publicAddresses': {
    *                           'x.x.x.x': {
    *                               'current': {
    *                                   'PrivateIpAddress': 'x.x.x.x',
    *                                   'AssociationId': 'id'
    *                               },
    *                               'target': {
    *                                   'PrivateIpAddress': 'x.x.x.x',
    *                                   'NetworkInterfaceId': 'id'
    *                               },
    *                               'AllocationId': eip.AllocationId
    *                           }
    *                       },
    *                       'interfaces': {
    *                           "disassociate": [
    *                               {
    *                                   'addresses': [],
    *                                   'networkInterfaceId': 'id'
    *                               }
    *                           ],
    *                           "associate": [
    *                               {
    *                                   'addresses': [],
    *                                   'networkInterfaceId': 'id'
    *                               }
    *                           ]
    *                   }
    */
    _discoverAddressOperations(localAddresses, failoverAddresses) {
        return Promise.all([
            this._getElasticIPs({ tags: this.addressTags }),
            this._getPrivateSecondaryIPs(),
            this._listNics({ tags: this.addressTags }),
            this._getSubnets()
        ])
            .then((results) => {
                const eips = results[0].Addresses;
                const secondaryPrivateIps = results[1];
                const nics = results[2];
                this.logger.debug('_discoverAddressOperations found Elastic IPs:', eips);
                this.logger.debug('_discoverAddressOperations found Private Secondary IPs', secondaryPrivateIps);
                this.logger.debug('_discoverAddressOperations found Nics', nics);
                const parsedNics = this._parseNics(nics, localAddresses, failoverAddresses);
                this.logger.debug('_discoverAddressOperations parsed nics ', parsedNics);

                return Promise.all([
                    this._generatePublicAddressOperations(eips, secondaryPrivateIps),
                    this._generateAddressOperations(localAddresses,
                        failoverAddresses, parsedNics)
                ]);
            })
            .then((operations) => Promise.resolve({
                publicAddresses: operations[0],
                interfaces: operations[1],
                loadBalancerAddresses: {}
            }))
            .catch((err) => Promise.reject(err));
    }

    /**
    * Update addresses - given reassociate operation(s)
    *
    * @param {Object} operations - operations object { publicAddresses: {}, interfaces: [] }
    *
    * @returns {Promise}
    */
    _updateAddresses(operations) {
        if (!operations || !Object.keys(operations).length) {
            this.logger.debug('No update address operations to perform');
            return Promise.resolve();
        }
        this.logger.debug('Update address operations to perform', operations);
        return Promise.all([
            this._reassociatePublicAddresses(operations.publicAddresses),
            this._reassociateAddresses(operations.interfaces)
        ])
            .then(() => {
                this.logger.info('Addresses reassociated successfully');
            })
            .catch((err) => Promise.reject(err));
    }

    /**
    * Resolve CIDR block - whether IPv4 or IPv6
    *
    * @param {Object} route - provider route object
    *
    * @returns {Object} { cidrBlock: '192.0.2.0/24', ipVersion: '4' }
    */
    _resolveRouteCidrBlock(route) {
        return {
            cidrBlock: route.DestinationIpv6CidrBlock ? route.DestinationIpv6CidrBlock : route.DestinationCidrBlock,
            ipVersion: route.DestinationIpv6CidrBlock ? '6' : '4'
        };
    }

    /**
    * Discover route operations
    *
    * @param {Array} localAddresses - array containing local (self) addresses [ '192.0.2.1' ]
    * @param {Object} routeGroup    - object containing group properties
    * @param {Array} routeTables    - array of route tables
    *
    * @returns {Promise} [ { routeTable: {}, networkInterfaceId: 'foo' }]
    */
    _discoverRouteOperationsPerGroup(localAddresses, routeGroup, routeTables) {
        const operations = [];
        const filteredRouteTables = this._filterRouteTables(
            routeTables,
            {
                name: routeGroup.routeName,
                tags: routeGroup.routeTags
            }
        );

        filteredRouteTables.forEach((routeTable) => {
            routeTable.Routes.forEach((route) => {
                const matchedAddressRange = this._matchRouteToAddressRange(
                    this._resolveRouteCidrBlock(route).cidrBlock,
                    routeGroup.routeAddressRanges
                );
                if (matchedAddressRange) {
                    const nextHopAddress = this._discoverNextHopAddress(
                        localAddresses,
                        routeTable.Tags,
                        matchedAddressRange.routeNextHopAddresses
                    );
                    if (nextHopAddress) {
                        operations.push(this._getUpdateOperationObject(
                            matchedAddressRange.routeAddresses, nextHopAddress, routeTable, route
                        ));
                    }
                }
            });
        });

        return Promise.all(operations)
            .then((routesToUpdate) => routesToUpdate.filter((route) => Object.keys(route).length))
            .catch((err) => Promise.reject(err));
    }

    /**
    * Get update operation
    *
    * @param {Array} routeAddresses - array of route addresses
    * @param {String} address       - object containing group properties
    * @param {Object} routeTable    - route table
    * @param {Object} route         - route in route table
    *
    * @returns {Promise} { routeTable: {}, networkInterfaceId: '', routeAddress: '', ipVersion: '' }
    */
    _getUpdateOperationObject(routeAddresses, address, routeTable, route) {
        return this._getNetworkInterfaceId(address)
            .then((networkInterfaceId) => {
                this.logger.silly('Discovered networkInterfaceId ', networkInterfaceId);
                const updateRequired = (routeAddresses.indexOf(this._resolveRouteCidrBlock(route).cidrBlock) !== -1
                    && (route.NetworkInterfaceId && route.NetworkInterfaceId !== networkInterfaceId));
                this.logger.silly(`Update required (${updateRequired}) for route cidr block ${this._resolveRouteCidrBlock(route).cidrBlock}`);
                // if an update is not required just return an empty object
                if (!updateRequired) {
                    return Promise.resolve({});
                }
                // return information required for update later
                return Promise.resolve({
                    routeTableId: routeTable.RouteTableId,
                    networkInterfaceId,
                    routeAddress: this._resolveRouteCidrBlock(route).cidrBlock,
                    nextHopAddress: address,
                    ipVersion: this._resolveRouteCidrBlock(route).ipVersion
                });
            })
            .catch((err) => Promise.reject(err));
    }

    /**
    * Update addresses - given reassociate operation(s)
    *
    * @param {Object} operations - operations object
    *
    * @returns {Promise}
    */
    _updateRoutes(operations) {
        if (!operations || !operations.length) {
            this.logger.info('No route operations to run');
            return Promise.resolve();
        }

        const promises = [];
        operations.forEach((operation) => {
            promises.push(this._updateRouteTable(
                operation.routeTableId,
                operation.networkInterfaceId,
                operation.routeAddress,
                operation.ipVersion
            ));
        });
        return Promise.all(promises)
            .then(() => {
                this.logger.info('Route(s) updated successfully');
            })
            .catch((err) => Promise.reject(err));
    }

    /**
     * Iterates through the routes and perfoms route replacement
     *
     * @param {Object} routeTable         - Route table with routes
     * @param {String} networkInterfaceId - Network interface that the route if to be updated to
     * @param {Array} routeAddressRange   - Route Address Range whose destination needs to be updated
     * @param {String} ipVersion          - IP Version of the route ('4' or '6')
     *
     * @returns {Promise} - Resolves or rejects if route is replaced
     */
    _updateRouteTable(routeTableId, networkInterfaceId, routeAddressRange, ipVersion) {
        this.logger.silly('Updating route: ', routeTableId, networkInterfaceId);

        const params = {
            NetworkInterfaceId: networkInterfaceId,
            RouteTableId: routeTableId
        };

        // check for IPv6, default to IPv4
        if (ipVersion === '6') {
            params.DestinationIpv6CidrBlock = routeAddressRange;
        } else {
            params.DestinationCidrBlock = routeAddressRange;
        }

        return this._replaceRoute(params);
    }

    /**
     * Fetches the network interface ID given a private IP
     *
     * @param {String} privateIp - Private IP
     *
     * @returns {Promise} - Resolves with the network interface id associated with the private Ip or rejects
     */
    _getNetworkInterfaceId(privateIp) {
        const options = {
            tags: this.addressTags
        };
        const address = new IPAddressLib.Address4(privateIp);
        if (address.isValid()) {
            this.logger.debug('Using IPv4 filtering for to get nics', privateIp);
            options.privateAddress = privateIp;
        } else {
            this.logger.debug('Using IPv6 filtering for to get nics', privateIp);
            options.ipv6Address = privateIp;
        }
        return this._listNics(options)
            .then((nics) => Promise.resolve(nics[0].NetworkInterfaceId))
            .catch((err) => Promise.reject(err));
    }

    /**
     * Fetches the route tables based on the provided tag
     *
     * @param {Object} options                  - function options
     * @param {Object} [options.instanceId]     - object containing instanceId to filter on
     * @returns {Promise} - Resolves or rejects with list of route tables filtered by the supplied tag
     */
    _getRouteTables(options) {
        options = options || {};
        const params = options.instanceId ? this._addFilterToParams({}, 'route.instance-id', options.instanceId) : {};

        return this._describeRouteTables(params)
            .then((routeTables) => Promise.resolve(routeTables.RouteTables || []))
            .catch((err) => Promise.reject(err));
    }

    /**
     * Re-associates the Elastic IP Addresses. Will first attempt to disassociate and then associate
     * the Elastic IP Address(es) to the newly active BIG-IP
     *
     * @param {Object} operations - reassocate public address operations
     *
     * @returns {Promise} - Resolves or rejects with status of moving the EIP
     */
    _reassociatePublicAddresses(operations) {
        operations = operations || {};
        const disassociatePromises = [];
        const associatePromises = [];
        this.logger.debug('Starting disassociating Elastic IP', disassociatePromises);
        Object.keys(operations).forEach((eipKeys) => {
            const AssociationId = operations[eipKeys].current.AssociationId;
            // Disassociate EIP only if it is currently associated
            if (AssociationId) {
                disassociatePromises.push(this._retrier(this._disassociatePublicAddress, [AssociationId]));
            }
        });

        // Disassociate EIP, in case EIP wasn't created with ability to reassociate when already associated
        return Promise.all(disassociatePromises)
            .then(() => {
                this.logger.silly('Disassociation of Elastic IP addresses successful');

                Object.keys(operations).forEach((eipKeys) => {
                    const allocationId = operations[eipKeys].AllocationId;
                    const networkInterfaceId = operations[eipKeys].target.NetworkInterfaceId;
                    const privateIpAddress = operations[eipKeys].target.PrivateIpAddress;

                    // Associate EIP only if all variables are present
                    if (allocationId && networkInterfaceId && privateIpAddress) {
                        associatePromises.push(this._retrier(
                            this._associatePublicAddress,
                            [allocationId, networkInterfaceId, privateIpAddress]
                        ));
                    }
                });
                return Promise.all(associatePromises);
            })
            .then(() => {
                if (associatePromises.length === 0) {
                    this.logger.info('Association of Elastic IP addresses not required');
                } else {
                    this.logger.info('Association of Elastic IP addresses successful');
                }
            })
            .catch((err) => Promise.reject(err));
    }

    /**
     * Disassociate the Elastic IP address
     *
     * @param {String} disassociationId  - Elastic IP associate to disassociate
     *
     * @returns {Promise} - A promise resolved or rejected based on the status of disassociating the Elastic IP Address
     */
    _disassociatePublicAddress(disassociationId) {
        this.logger.debug(`Disassociating address using ${disassociationId}`);

        const queryParams = {
            Action: 'DisassociateAddress',
            AssociationId: disassociationId
        };
        return this.ec2ApiRequest({ queryParams })
            .then((response) => response.Return)
            .catch(() => Promise.resolve(false));
    }

    /**
     * Associate the Elastic IP address to a PrivateIP address on a given NIC
     *
     * @param {String} allocationId         - Elastic IP allocation ID
     * @param {String} networkInterfaceId   - ID of NIC with the Private IP address
     * @param {String} privateIpAddress     - Private IP Address on the NIC to attach the Elastic IP address to
     *
     * @returns {Promise} - A Promise rejected or resolved based on the status of associating the Elastic IP address
     */
    _associatePublicAddress(allocationId, networkInterfaceId, privateIpAddress) {
        this.logger.debug(`Associating ${privateIpAddress} to ${networkInterfaceId} using ID ${allocationId}`);

        const options = {
            queryParams: {
                Action: 'AssociateAddress',
                AllocationId: allocationId,
                NetworkInterfaceId: networkInterfaceId,
                PrivateIpAddress: privateIpAddress,
                AllowReassociation: true
            }
        };

        return this.ec2ApiRequest(options);
    }

    /**
     * Reassociate public address to NIC
     *
     * @param {String} publicAddress      - public address to reassociate
     * @param {String} networkInterfaceId - network interface ID to associate to
     * @param {String} privateAddress     - private address to associate to
     *
     * @returns {Promise} - Resolves when the public address has been reassociated or rejects if an error occurs
     */
    _reassociatePublicAddressToNic(publicAddress, networkInterfaceId, privateAddress) {
        this.logger.debug(`Reassociating ${publicAddress} to ${privateAddress} attached to NIC ${networkInterfaceId}`);

        let addressInfo;

        return this._getElasticIPs({ publicAddress })
            .then((data) => {
                addressInfo = data.Addresses[0] || {};

                if (!addressInfo.AssociationId) {
                    return Promise.resolve();
                }
                return this._disassociatePublicAddress(addressInfo.AssociationId);
            })
            .then(() => this._associatePublicAddress(addressInfo.AllocationId, networkInterfaceId, privateAddress))
            .catch((err) => Promise.reject(err));
    }

    /**
     * Re-associates addresses to different NICs via disassociate and then associate operations
     *
     * @param {Object} operations - operations we should perform
     *
     * @returns {Promise} - Resolves when all addresses are reassociated or rejects if an error occurs
     */
    _reassociateAddresses(operations) {
        operations = operations || {};
        const disassociate = operations.disassociate || [];
        const associate = operations.associate || [];
        let promises = [];
        this.logger.debug('Starting reassociating addresses using operations', operations);
        disassociate.forEach((association) => {
            const args = [association.networkInterfaceId, association.addresses];
            promises.push(this._retrier(this._disassociateAddressFromNic, args));
        });

        return Promise.all(promises)
            .then(() => {
                promises = [];
                associate.forEach((association) => {
                    const args = [association.networkInterfaceId, association.addresses];
                    promises.push(this._retrier(this._associateAddressToNic, args));
                });
                return Promise.all(promises);
            })
            .then(() => {
                this.logger.silly('Reassociation of addresses is complete');
            })
            .catch((err) => Promise.reject(err));
    }

    /**
     * Make EC2 (Un)AssignIpv6Addresses API request
     *
     * @param {String} action             - ec2 api endpoint name
     * @param {String} networkInterfaceId - network interface ID
     * @param {Array} ipv6                - ipv6 addresses to (un))assign
     *
     * @returns {Promise} - Resolves when all addresses are disassociated or rejects if an error occurs
     */
    _getIpv6Ec2ApiRequest(action, networkInterfaceId, ipv6) {
        const options = {
            queryParams: {
                Action: action === 'AssignIpv6Addresses' ? 'AssignIpv6Addresses' : 'UnassignIpv6Addresses',
                NetworkInterfaceId: networkInterfaceId
            },
            host: this.ec2_host
        };
        let paramCtr = 1;
        ipv6.Ipv6Addresses.forEach((ipv6Key) => {
            options.queryParams[`Ipv6Addresses.${paramCtr}`] = ipv6Key;
            paramCtr += 1;
        });

        return this.ec2ApiRequest(options);
    }

    /**
     * Disassociate address from NIC
     *
     * @param {String} networkInterfaceId - network interface ID
     * @param {Array} addresses           - addresses to disassociate: [{address: '', publicAddress: ''}]
     *
     * @returns {Promise} - Resolves when all addresses are disassociated or rejects if an error occurs
     */
    _disassociateAddressFromNic(networkInterfaceId, addresses) {
        this.logger.debug(`Disassociating ${util.stringify(addresses)} from ${networkInterfaceId}`);

        const params = this._getIpParamsByVersion(networkInterfaceId, addresses);
        this.logger.debug(`addresses ipv4Params to disassociate: ${util.stringify(params.ipv4)}`);
        this.logger.debug(`addresses ipv6params to disassociate: ${util.stringify(params.ipv6)}`);
        let promise = {};
        if (params.ipv6.Ipv6Addresses.length > 0) {
            this.logger.debug(`disassociating ipv6 addresses: ${util.stringify(params.ipv6)}`);
            promise = this._getIpv6Ec2ApiRequest('UnassignIpv6Addresses', networkInterfaceId, params.ipv6);
        }
        return Promise.resolve(promise)
            .then(() => {
                if (params.ipv4.PrivateIpAddresses.length > 0) {
                    const queryParams = {
                        Action: 'UnassignPrivateIpAddresses',
                        NetworkInterfaceId: networkInterfaceId
                    };
                    let paramCtr = 1;
                    params.ipv4.PrivateIpAddresses.forEach((ipv4) => {
                        queryParams[`PrivateIpAddress.${paramCtr}`] = ipv4;
                        paramCtr += 1;
                    });
                    return this.ec2ApiRequest({ queryParams })
                        .then((response) => response.Return)
                        .catch(() => Promise.resolve(false));
                }
                return Promise.resolve({});
            })
            .catch((err) => Promise.reject(err));
    }

    /**
     * Associate address to NIC
     *
     * @param {String} networkInterfaceId - network interface ID
     * @param {Array} addresses           - addresses to associate: [{address: '', publicAddress: ''}]
     *
     * @returns {Promise} - Resolves when all addresses are associated or rejects if an error occurs
     */
    _associateAddressToNic(networkInterfaceId, addresses) {
        this.logger.debug(`Associating ${util.stringify(addresses)} to ${networkInterfaceId}`);

        const params = this._getIpParamsByVersion(networkInterfaceId, addresses);
        this.logger.debug(`addresses ipv4Params to associate: ${util.stringify(params.ipv4)}`);
        this.logger.debug(`addresses ipv6params to associate: ${util.stringify(params.ipv6)}`);
        let promise = {};
        if (params.ipv6.Ipv6Addresses.length > 0) {
            this.logger.debug(`associating ipv6 addresses: ${util.stringify(params.ipv6)}`);

            promise = this._getIpv6Ec2ApiRequest('AssignIpv6Addresses', networkInterfaceId, params.ipv6);
        }
        return Promise.resolve(promise)
            .then(() => {
                if (params.ipv4.PrivateIpAddresses.length > 0) {
                    return this._assignPrivateIpv4Addresses(params.ipv4, addresses);
                }
                return Promise.resolve({});
            })
            .catch((err) => Promise.reject(err));
    }

    /**
     * Construct params for IPv4 and IPv6
     *
     * @param {String} networkInterfaceId - network interface ID
     * @param {Array} addresses           - addresses to associate: [{address: '', publicAddress: ''}]
     *
     * @returns {Object} - Object of IPv4 and IPv6 params
     */
    _getIpParamsByVersion(networkInterfaceId, addresses) {
        const ipv4Params = {
            NetworkInterfaceId: networkInterfaceId,
            PrivateIpAddresses: []
        };
        const ipv6Params = {
            NetworkInterfaceId: networkInterfaceId,
            Ipv6Addresses: []
        };

        addresses.forEach((address) => {
            if (address.address) {
                if (address.ipVersion === 6) {
                    ipv6Params.Ipv6Addresses.push(address.address);
                } else {
                    ipv4Params.PrivateIpAddresses.push(address.address);
                }
            }
        });
        return { ipv4: ipv4Params, ipv6: ipv6Params };
    }

    /**
     *  Assign private IPv4 addresses
     *
     * @param {Object} ipv4Params          - params for IPv4
     * @param {Array} addresses            - addresses to assign: [{address: '', publicAddress: ''}]
     *
     * @returns {Promise} -                - resolved when private IPv4 addresses are assigned and
     * public addresses are reassociated to NIC
     */
    _assignPrivateIpv4Addresses(ipv4Params, addresses) {
        const queryParams = {
            Action: 'AssignPrivateIpAddresses',
            NetworkInterfaceId: ipv4Params.NetworkInterfaceId
        };
        let paramCtr = 1;
        ipv4Params.PrivateIpAddresses.forEach((ipv4) => {
            queryParams[`PrivateIpAddress.${paramCtr}`] = ipv4;
            paramCtr += 1;
        });
        return this.ec2ApiRequest({ queryParams })
            .then(() => {
                const promises = [];
                addresses.forEach((address) => {
                    if (address.publicAddress) {
                        promises.push(this._reassociatePublicAddressToNic(
                            address.publicAddress, ipv4Params.NetworkInterfaceId, address.address
                        ));
                    }
                });
                return Promise.all(promises);
            })
            .catch((err) => Promise.reject(err));
    }

    /**
     * Generate the Elastic IP configuration data required to reassociate the Elastic IP addresses
     *
     * @param {Object} eips               - Array of Elastic IP information, as returned from AWS.
     * @param {Object} privateInstanceIPs - Collection of Secondary Private IP addresses, and their associated NIC ID
     *
     * @returns {Promise} - A Promise that is resolved with the Elastic IP configuration, or rejected if an error occurs
     */
    _generatePublicAddressOperations(eips, privateInstanceIPs) {
        const updatedState = {};
        this.logger.debug(`eips: ${JSON.stringify(eips)}, privateInstanceIPs: ${JSON.stringify(privateInstanceIPs)}`);
        eips.forEach((eip) => {
            const vipsTag = eip.Tags.find((tag) => constants.AWS_VIPS_TAGS.indexOf(tag.Key) !== -1);
            const targetAddresses = vipsTag && vipsTag.Value ? vipsTag.Value.split(',') : [];
            targetAddresses.forEach((targetAddress) => {
                // Check if the target address is present on local BIG-IP, and if the EIP isn't already associated
                if (targetAddress in privateInstanceIPs && targetAddress !== eip.PrivateIpAddress) {
                    this.logger.silly(
                        `Moving public address: ${eip.PublicIp} to address: ${targetAddress}, and off of ${eip.PrivateIpAddress}`
                    );

                    updatedState[eip.PublicIp] = {
                        current: {
                            PrivateIpAddress: eip.PrivateIpAddress,
                            AssociationId: eip.AssociationId
                        },
                        target: {
                            PrivateIpAddress: targetAddress,
                            NetworkInterfaceId: privateInstanceIPs[targetAddress].NetworkInterfaceId
                        },
                        AllocationId: eip.AllocationId
                    };
                }
            });
        });
        this.logger.debug('Generated Public Address Operations', updatedState);
        return updatedState;
    }

    /**
    * Parse Nics - figure out which nics are 'mine' vs. 'theirs'
    *
    * Note: This function should ensure no duplicate nics are added
    *
    * @param {Object} nics              - nics
    * @param {Object} localAddresses    - local addresses
    * @param {Object} failoverAddresses - failover addresses
    *
    * @returns {Object} { 'mine': [], 'theirs': [] }
    */
    _parseNics(nics, localAddresses) {
        // add nics to 'mine' or 'their' array based on address match
        const myNics = [];
        const theirNics = [];
        const mine = nics.filter((nic) => localAddresses.includes(nic.PrivateIpAddress));
        const theirs = nics.filter((nic) => !localAddresses.includes(nic.PrivateIpAddress));

        mine.forEach((nic) => {
            myNics.push({ nic });
        });

        theirs.forEach((nic) => {
            theirNics.push({ nic });
        });
        return { mine: myNics, theirs: theirNics };
    }

    /**
    * Parse Subnets - figure out which subnets are ours
    *
    * @param {Object} nics              - nics
    * @param {Object} subnets           - all subnets
    *
    * @returns {Object} subnet
    */
    _parseSubnets(nic, subnets) {
        let foundSubnet = {};

        /* eslint-disable-next-line no-restricted-syntax */
        for (const subnet of subnets.Subnets) {
            if (nic.SubnetId === subnet.SubnetId) {
                foundSubnet = subnet;
                break;
            }
        }

        return foundSubnet;
    }

    /**
     * Check for any NIC operations required
     *
     * @param {Array} myNic             - 'my' NIC object
     * @param {Object} theirNic          - 'their' NIC object
     * @param {Object} failoverAddresses - failover addresses
     *
     * @returns {Object} { 'disassociate': [], 'association: [] }
     */
    _checkForNicOperations(myNic, theirNic, failoverAddresses) {
        const subnets = this.subnets;
        let mySubnetCidr;
        let theirSubnetCidr;
        let foundSubnetInformation = false;
        if (subnets === undefined) {
            this.logger.debug('No subnets found, possibly due to missing permissions');
        } else if (!Object.keys(subnets).length) {
            this.logger.debug('No subnets found, possibly due to missing permissions');
        } else if (!subnets.Subnets.length) {
            this.logger.debug('No subnets found, possibly due to missing permissions');
        } else {
            foundSubnetInformation = true;
            this.logger.debug('_checkForNicOperations found subnets', subnets);
            const mySubnet = this._parseSubnets(myNic, subnets);
            const theirSubnet = this._parseSubnets(theirNic, subnets);

            this.logger.silly('_checkForNicOperations found mySubnet', mySubnet);
            this.logger.silly('_checkForNicOperations found theirSubnet', theirSubnet);

            mySubnetCidr = new IPAddressLib.Address4(mySubnet.CidrBlock);
            theirSubnetCidr = new IPAddressLib.Address4(theirSubnet.CidrBlock);

            this.logger.silly('_checkForNicOperations calc mySubnetCidr', mySubnetCidr);
            this.logger.silly('_checkForNicOperations calc theirSubnetCidr', theirSubnetCidr);
        }

        const addressesToTake = [];
        const myNicAddress = myNic.PrivateIpAddress;
        const theirNicAddress = theirNic.PrivateIpAddress;
        const theirNicAddresses = theirNic.PrivateIpAddresses;

        this.logger.silly('_checkForNicOperations found myNicAddress', myNicAddress);
        this.logger.silly('_checkForNicOperations found theirNicAddress', theirNicAddress);

        // check if Ipv6Address exists and if so add it to the list
        this.logger.debug('_checkForNicOperations performing ipv6 check');
        if (theirNic.Ipv6Addresses && theirNicAddresses.length > 0) {
            theirNic.Ipv6Addresses.forEach((ipv6Address) => {
                theirNicAddresses.push(ipv6Address);
            });
        }

        this.logger.silly(`_checkForNicOperations myNic: ${util.stringify(myNic)}`);
        this.logger.silly(`_checkForNicOperations theirNic: ${util.stringify(theirNic)}`);
        this.logger.silly(`_checkForNicOperations failoverAddress: ${util.stringify(failoverAddresses)}`);
        this.logger.silly(`length of theirNicAddresses: ${theirNicAddresses.length}, failoverAddresses: ${failoverAddresses.length}`);
        for (let i = theirNicAddresses.length - 1; i >= 0; i -= 1) {
            for (let t = failoverAddresses.length - 1; t >= 0; t -= 1) {
                this.logger.silly(`failoverAddress: ${util.stringify(failoverAddresses[t])}`);
                this.logger.silly(`theirNicAddress: ${util.stringify(theirNicAddresses[i])}`);

                this.logger.silly(`theirNicAddresses: ${theirNicAddress}`);
                this.logger.silly(`myNicAddress: ${myNicAddress}`);

                const theirAddress = new IPAddressLib.Address4(theirNicAddress);
                const myAddress = new IPAddressLib.Address4(myNicAddress);

                if (foundSubnetInformation) {
                    this.logger.silly(`theirAddress isInSubnet: ${theirAddress.isInSubnet(mySubnetCidr)}`);
                    this.logger.silly(`myAddress isInSubnet: ${myAddress.isInSubnet(theirSubnetCidr)}`);

                    if (theirAddress.isInSubnet(mySubnetCidr) && myAddress.isInSubnet(theirSubnetCidr)) {
                        if (theirNicAddresses[i].PrivateIpAddress
                        && failoverAddresses[t] === theirNicAddresses[i].PrivateIpAddress
                        && theirNicAddresses[i].Primary !== true
                        && theirNicAddresses[i].Primary !== 'true') {
                            this.logger.silly('Match:', theirNicAddresses[i].PrivateIpAddress, theirNicAddresses[i]);

                            addressesToTake.push({
                                address: theirNicAddresses[i].PrivateIpAddress,
                                publicAddress: util.getDataByKey(theirNicAddresses[i], 'Association.PublicIp'),
                                ipVersion: 4
                            });
                        } else if (theirNicAddresses[i].Ipv6Address
                        && util.validateIpv6Address(failoverAddresses[t])
                        && failoverAddresses[t] === theirNicAddresses[i].Ipv6Address
                        && !util.stringify(addressesToTake).includes(failoverAddresses[t])) {
                            this.logger.silly(`will add address ${failoverAddresses[t]} into addressToTake`);
                            addressesToTake.push({
                                address: failoverAddresses[t],
                                ipVersion: 6
                            });
                        }
                    } else {
                        this.logger.warning('Assumed same-net operation, but subnet CIDRs do not match, therefore no private IP disassociation will happen');
                    }
                } else if (theirNicAddresses[i].PrivateIpAddress
                && failoverAddresses[t] === theirNicAddresses[i].PrivateIpAddress
                && theirNicAddresses[i].Primary !== true
                && theirNicAddresses[i].Primary !== 'true') {
                    this.logger.silly('Match:', theirNicAddresses[i].PrivateIpAddress, theirNicAddresses[i]);
                    addressesToTake.push({
                        address: theirNicAddresses[i].PrivateIpAddress,
                        publicAddress: util.getDataByKey(theirNicAddresses[i], 'Association.PublicIp'),
                        ipVersion: 4
                    });
                } else if (theirNicAddresses[i].Ipv6Address
                && util.validateIpv6Address(failoverAddresses[t])
                && failoverAddresses[t] === theirNicAddresses[i].Ipv6Address
                && !util.stringify(addressesToTake).includes(failoverAddresses[t])) {
                    this.logger.silly(`will add address ${failoverAddresses[t]} into addressToTake`);
                    addressesToTake.push({
                        address: failoverAddresses[t],
                        ipVersion: 6
                    });
                }
            }
        }
        this.logger.silly(`addressesToTake: ${util.stringify(addressesToTake)}`);
        return {
            disassociate: {
                networkInterfaceId: theirNic.NetworkInterfaceId,
                addresses: addressesToTake
            },
            associate: {
                networkInterfaceId: myNic.NetworkInterfaceId,
                addresses: addressesToTake
            }
        };
    }

    /**
     * Get all Private Secondary IP addresses for this BIG-IP, and their associated NIC ID
     *
     * @returns {Promise}   - A Promise that will be resolved with all of the Private Secondary IP address, or
     *                          rejected if an error occurs. Example response:
     *
     *                          {
     *                              "10.0.11.139": {
     *                                  "NetworkInterfaceId":"eni-034a05fef728d501b"
     *                              }
     *                          }
     */
    _getPrivateSecondaryIPs() {
        const params = this._addFilterToParams({}, 'attachment.instance-id', this.instanceId);

        return this._describeNetworkInterfaces(params)
            .then((data) => {
                this.logger.silly(`data found in Network interfaces: ${util.stringify(data)}`);
                const privateIps = {};
                data.NetworkInterfaces.forEach((nic) => {
                    nic.PrivateIpAddresses.forEach((privateIp) => {
                        if (privateIp.Primary === false || privateIp.Primary === 'false') {
                            privateIps[privateIp.PrivateIpAddress] = {
                                NetworkInterfaceId: nic.NetworkInterfaceId
                            };
                        }
                    });
                });
                this.logger.silly(`privateIps discovered: ${util.stringify(privateIps)}`);
                return Promise.resolve(privateIps);
            })
            .catch((err) => Promise.reject(err));
    }

    /**
     * List nics from EC2, optionally filter using tags and/or private address
     *
     * @param {Object} options                  - function options
     * @param {Object} [options.tags]           - object containing tags to filter on: { 'key': 'value' }
     * @param {String} [options.privateAddress] - String containing private address to filter
     * @param {String} [options.ipv6Address]    - String containing ipv6 address to filter
     *
     * @returns {Promise} - A Promise that will be resolved with thearray of NICs,
     * or rejected if an error occurs.  Example response:
     *                      [
     *                          {
     *                              "NetworkInterfaceId": "id",
     *                              "PrivateIpAddresses": [],
     *                              ...
     *                          }
     *                      ]
     */
    _listNics(options) {
        options = options || {};
        const tags = options.tags || null;
        const privateAddress = options.privateAddress || null;
        const ipv6Address = options.ipv6Address || null;

        let params = {
            Filters: []
        };
        if (tags) {
            Object.keys(tags).forEach((tagKey) => {
                params = this._addFilterToParams(params, `tag:${tagKey}`, tags[tagKey]);
            });
        }
        params = privateAddress ? this._addFilterToParams(params, 'private-ip-address', privateAddress) : params;
        params = ipv6Address ? this._addFilterToParams(params, 'ipv6-addresses.ipv6-address', ipv6Address) : params;

        return this._describeNetworkInterfaces(params)
            .then((data) => {
                const nics = [];
                data.NetworkInterfaces.forEach((nic) => {
                    nics.push(nic);
                });
                return Promise.resolve(nics);
            })
            .catch((err) => Promise.reject(err));
    }

    /**
     * Returns the Elastic IP address(es) associated with this BIG-IP cluster
     *
     * @param {Object} options                 - function options
     * @param {Object} [options.tags]          - object containing tags to filter on { 'key': 'value' }
     * @param {Object} [options.instanceId]    - object containing instanceId to filter on
     * @param {Object} [options.publicAddress] - object containing public address to filter on
     * @param {Object} [options.privateAddress] - object containing private address to filter on
     *
     * @returns {Promise}   - A Promise that will be resolved with an array of Elastic IP(s), or
     *                          rejected if an error occurs
     */
    _getElasticIPs(opts) {
        const options = {
            queryParams: {
                Action: 'DescribeAddresses',
                Version: API_VERSION_EC2
            },
            region: this.region,
            host: this.ec2_host || constants.API_HOST_EC2
        };
        let params = {
            Filters: []
        };
        opts = opts || {};
        const tags = opts.tags || null;
        if (tags) {
            Object.keys(tags).forEach((tagKey) => {
                params = this._addFilterToParams(params, `tag:${tagKey}`, tags[tagKey]);
            });
        }
        params = opts.instanceId || null ? this._addFilterToParams(params, 'instance-id', this.instanceId) : params;
        params = opts.publicAddress || null ? this._addFilterToParams(params, 'public-ip', opts.publicAddress) : params;
        params = opts.privateAddress || null ? this._addFilterToParams(params, 'private-ip-address', opts.privateAddress) : params;
        options.queryParams = this._addFiltersToQueryParams(params, options.queryParams);

        return this.ec2ApiRequest(options);
    }

    /**
     * Gets instance identity document
     *
     * @returns {Promise}   - A Promise that will be resolved with the Instance Identity document or
     *                          rejected if an error occurs
     */
    _getInstanceIdentityDoc() {
        return util.makeRequest(constants.METADATA_HOST, '/latest/dynamic/instance-identity/document', {
            protocol: 'http',
            port: 80,
            headers: {
                'x-aws-ec2-metadata-token': this._sessionToken
            }
        })
            .then((response) => (typeof response === 'object' ? response : JSON.parse(response)))
            .catch((err) => Promise.reject(err));
    }

    /**
     * Gets the S3 bucket to use, from the provided storage tags
     *
     * @param   {Object}    tags - object containing tags to filter on { 'key': 'value' }
     *
     * @returns {Promise}   - A Promise that will be resolved with the S3 bucket name or
     *                          rejected if an error occurs
     */
    _getS3BucketByTags(tags) {
        const getBucketTagsPromises = [];

        return this._getAllS3Buckets()
            .then((data) => {
                data.forEach((bucket) => {
                    const args = [bucket, { continueOnError: true }];
                    getBucketTagsPromises.push(this._retrier(this._getBucketTags, args));
                });
                return Promise.all(getBucketTagsPromises);
            })
            // Filter out any 'undefined' responses
            .then((data) => Promise.resolve(data.filter((i) => i)))
            .then((taggedBuckets) => {
                const tagKeys = Object.keys(tags);
                const filteredBuckets = taggedBuckets.filter((taggedBucket) => {
                    let matchedTags = 0;
                    const bucketDict = this._normalizeTags(taggedBucket.TagSet);
                    tagKeys.forEach((tagKey) => {
                        if (Object.keys(bucketDict).indexOf(tagKey) !== -1 && bucketDict[tagKey] === tags[tagKey]) {
                            matchedTags += 1;
                        }
                    });
                    return tagKeys.length === matchedTags;
                });
                this.logger.debug('Filtered Buckets:', filteredBuckets);
                return Promise.resolve(filteredBuckets);
            })
            .then((filteredBuckets) => {
                if (!filteredBuckets.length) {
                    return Promise.reject(new Error('No valid S3 Buckets found!'));
                }
                return Promise.resolve(filteredBuckets[0].bucket); // grab the first bucket for now
            })
            .catch((err) => Promise.reject(err));
    }

    /**
     * Get all S3 buckets in an account.
     * These buckets will later be filtered by tags
     *
     * @returns {Promise}   - A Promise that will be resolved with an array of objects containing each bucket
     *                        and its region, or rejected if an error occurs
     */
    _getAllS3Buckets() {
        const listAllBuckets = () => this.makeRequest(this.s3_host, '/', { region: this.region })
            .then((response) => {
                const promises = [];
                const template = parse(`<ListAllMyBucketsResult><Buckets>
                    <Bucket><Name c-bind="buckets|array">{{name}}</Name></Bucket>
                    </Buckets></ListAllMyBucketsResult>`);
                const buckets = template.fromXML(response).buckets || null;
                buckets.forEach((bucket) => {
                    promises.push(this._getBucketRegion(bucket.name));
                });
                return Promise.all(promises);
            })
            .then((buckets) => Promise.resolve(buckets))
            .catch((err) => Promise.reject(err));

        return listAllBuckets();
    }

    /**
     * Get the region of a given S3 bucket
     *
     * @param   {String}    bucketName - name of the S3 bucket
     *
     * @returns {Promise} - A Promise that will be resolved with a bucket object
     *                      containing the bucket name and region
     */
    _getBucketRegion(bucketName) {
        const bucketObject = {
            name: bucketName,
            region: this.region
        };
        const options = { method: 'HEAD', advancedReturn: true, continueOnError: true };

        return this.makeRequest(`${bucketName}.${constants.API_HOST_S3}`, '/', options)
            .then((response) => {
                bucketObject.region = response.headers['x-amz-bucket-region'] || this.region;
                return Promise.resolve(bucketObject);
            })
            .catch((err) => Promise.reject(err));
    }

    /**
     * Get the Tags of a given S3 bucket, optionally rejecting or resolving on errors
     *
     * @param   {String}    bucket                    - name of the S3 bucket
     * @param   {Object}    options                   - function options
     * @param   {Boolean}   [options.continueOnError] - whether or not to reject on error. Default: reject on error
     *
     * @returns {Promise}   - A Promise that will be resolved with the S3 bucket name or
     *                          rejected if an error occurs
     */
    _getBucketTags(bucket, options) {
        options = options || {};
        options.queryParams = { tagging: '' };
        options.region = bucket.region;
        const host = `${bucket.name}.s3.${bucket.region}.amazonaws.com`;

        return this.makeRequest(host, '/', options)
            .then((data) => {
                if (data.match(/<Error><Code>/)) {
                    const error = parse('<Error><Code>{{code}}</Code><Message>{{message}}</Message></Error>');
                    const err = error.fromXML(data);
                    throw new Error(`${err.code}; Message: ${err.message}`);
                }
                const template = parse(`<Tagging><TagSet><Tag c-bind="TagSet|array">
                        <Key>{{Key}}</Key><Value>{{Value}}</Value>
                    </Tag></TagSet></Tagging>`);
                const TagSet = template.fromXML(data).TagSet;
                if (TagSet && TagSet[0].Key) {
                    return Promise.resolve({ bucket, TagSet });
                }

                throw new Error(`Error: No tags found for Bucket: ${bucket}`);
            })
            .catch((err) => (options.continueOnError ? Promise.resolve() : Promise.reject(err)));
    }

    /**
     * Describe EC2 instance, with retry logic
     *
     * @param {Object} params - parameter options for operation
     *
     * @returns {Promise} - A Promise that will be resolved with the API response
     */
    _describeInstance(params) {
        const options = {
            queryParams: this._addFiltersToQueryParams(params, { Action: 'DescribeInstances' }),
            host: this.ec2_host
        };
        return this.ec2ApiRequest(options);
    }

    /**
     * Describe EC2 network interfaces, with retry logic
     *
     * @param {Object} params - parameter options for operation
     *
     * @returns {Promise} - A Promise that will be resolved with the API response
     */
    _describeNetworkInterfaces(params) {
        const options = {
            queryParams: this._addFiltersToQueryParams(params, { Action: 'DescribeNetworkInterfaces' })
        };
        return this.ec2ApiRequest(options);
    }

    /**
     * Describe EC2 route tables, with retry logic
     *
     * @param {Object} params - parameter options for operation
     *
     * @returns {Promise} - A Promise that will be resolved with the API response
     */
    _describeRouteTables(params) {
        const options = {
            queryParams: this._addFiltersToQueryParams(params, { Action: 'DescribeRouteTables' })
        };
        return this.ec2ApiRequest(options);
    }

    /**
     * Get full list of available EC2 subnets, with retry logic
     *
     * @param {Object} params - parameter options for operation
     *
     * @returns {Promise} - A Promise that will be resolved with the API response
     */
    _getSubnets() {
        this.logger.debug('Trying to get subnets');

        const options = { queryParams: { Action: 'DescribeSubnets' } };
        return this.ec2ApiRequest(options)
            .then((subnets) => {
                if (!subnets.Subnets.length) {
                    this.logger.debug('No subnets found! Please check for ec2:DescribeSubnets permission.');
                    this.subnets = subnets;
                    return Promise.resolve();
                }
                this.subnets = subnets;
                return Promise.resolve();
            })
            .catch(() => {
                this.logger.debug('No subnets found! Please check for ec2:DescribeSubnets permission.');
                Promise.resolve();
            });
    }

    /**
     * Describe EC2 route tables, with retry logic
     *
     * @param {Object} queryParams - request queryParams
     *
     * @returns {Promise} - A Promise that will be resolved with the API response
     */
    _replaceRoute(queryParams) {
        queryParams = queryParams || {};
        queryParams.Action = 'ReplaceRoute';

        const replaceEc2Route = (_params) => Promise.resolve(this._replaceEc2Route(_params));
        return this._retrier(replaceEc2Route, [queryParams]);
    }

    /**
     * Describe EC2 route tables, with retry logic
     *
     * @param {Object} queryParams - request queryParams
     *
     * @returns {Promise} - A Promise that will be resolved with the API response
     */
    _replaceEc2Route(queryParams) {
        const options = {
            queryParams,
            region: this.region
        };
        options.queryParams.Version = options.queryParams.Version || API_VERSION_EC2;
        const host = this.ec2_host || constants.API_HOST_EC2;

        return this.makeRequest(host, '/', options)
            .then((response) => {
                const tmpl = parse(XML_TEMPLATES[options.queryParams.Action]);
                return Promise.resolve(tmpl.fromXML(response) || {});
            })
            .catch((err) => Promise.reject(err));
    }
}

module.exports = {
    Cloud
};

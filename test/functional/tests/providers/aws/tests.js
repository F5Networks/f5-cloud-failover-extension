/*
 * Copyright 2019. F5 Networks, Inc. See End User License Agreement ("EULA") for
 * license terms. Notwithstanding anything to the contrary in the EULA, Licensee
 * may copy and modify this software product for its internal business purposes.
 * Further, Licensee may upload, publish and distribute the modified version of
 * the software product on devcentral.f5.com.
 */

'use strict';

const assert = require('assert');

const AWS = require('aws-sdk');

const utils = require('../../../../shared/util.js');
const funcUtils = require('../../shared/util.js');

const RETRIES = {
    LONG: 500,
    MEDIUM: 100,
    SHORT: 10
};

const duts = funcUtils.getHostInfo();
const dutPrimary = duts.filter(dut => dut.primary)[0];
const dutSecondary = duts.filter(dut => !dut.primary)[0];

const deploymentInfo = funcUtils.getEnvironmentInfo();
const deploymentDeclaration = funcUtils.getDeploymentDeclaration();

// Helper functions
function matchElasticIpToInstance(privateIp, instances, instance) {
    let match = false;
    const primary = instances[instance.ip];

    primary.NetworkInterfaces.forEach((nic) => {
        nic.PrivateIpAddresses.forEach((pip) => {
            if (pip.PrivateIpAddress === privateIp) {
                match = true;
            }
        });
    });

    // assert
    if (!match) {
        assert.fail('ElasticIP does not match primary\'s secondary private IP');
    }
}

function matchRouteTables(routes, instance) {
    console.log(deploymentDeclaration);
    console.log(routes);
    // iterate over routes to filter for the deployment declaration
    console.log(instance);
}

function forceStandby(ip, username, password) {
    const uri = '/mgmt/tm/sys/failover';

    return utils.getAuthToken(ip, username, password)
        .then((data) => {
            const options = funcUtils.makeOptions({ authToken: data.token });
            options.method = 'POST';
            options.body = {
                command: 'run',
                standby: true
            };
            return utils.makeRequest(ip, uri, options);
        })
        .catch(err => Promise.reject(err));
}

describe('Provider: AWS', () => {
    const privateIpToInstance = {};

    let ec2;

    before(function () {
        this.timeout(10000);

        AWS.config.update({ region: deploymentInfo.region });
        ec2 = new AWS.EC2();


        return getEc2Instances({ Key: 'deploymentId', Value: deploymentInfo.deploymentId })
            .then((data) => {
                Object.keys(data).forEach((key) => {
                    privateIpToInstance[data[key].PublicIpAddress] = {
                        InstanceId: key,
                        NetworkInterfaces: data[key].NetworkInterfaces
                    };
                });
            })
            .catch(err => Promise.reject(err));
    });
    after(() => {
        Object.keys(require.cache).forEach((key) => {
            delete require.cache[key];
        });
    });

    // local functions
    function getEc2Instances(tags) {
        const params = {
            Filters: [
                {
                    Name: `tag:${tags.Key}`,
                    Values: [tags.Value]
                }
            ]
        };

        return new Promise((resolve, reject) => {
            const instances = {};
            ec2.describeInstances(params).promise()
                .then((data) => {
                    data.Reservations.forEach((reservation) => {
                        const instance = reservation.Instances[0];
                        instances[instance.InstanceId] = instance;
                    });
                    resolve(instances);
                })
                .catch(err => reject(err));
        });
    }

    // function get
    function getElasticIpPrivateAddress() {
        const params = {
            Filters: [
                {
                    Name: 'tag:f5_cloud_failover_label',
                    Values: [deploymentInfo.deploymentId]
                }
            ]
        };

        return new Promise((resolve, reject) => {
            ec2.describeAddresses(params).promise()
                .then((data) => {
                    const privateIp = data.Addresses[0].PrivateIpAddress;
                    resolve(privateIp);
                })
                .catch(err => reject(err));
        });
    }

    function getRouteTableRoutes() {
        const params = {
            Filters: [
                {
                    Name: 'tag:f5_cloud_failover_label',
                    Values: [deploymentInfo.deploymentId]
                }
            ]
        };

        return new Promise((resolve, reject) => {
            ec2.describeRouteTables(params).promise()
                .then((data) => {
                    const routes = data.RouteTables[0].Routes;
                    resolve(routes);
                })
                .catch(err => reject(err));
        });
    }

    function checkElasticIP(instance) {
        return getElasticIpPrivateAddress()
            .then((privateIp) => {
                matchElasticIpToInstance(privateIp, privateIpToInstance, instance);
            })
            .catch(err => Promise.reject(err));
    }

    function checkRouteTable(instance) {
        return getRouteTableRoutes()
            .then((response) => {
                matchRouteTables(response, instance);
            })
            .catch(err => Promise.reject(err));
    }

    // Functional tests

    // Test IP and Route failover
    it('should check that Elastic IP is mapped to primary (vm0)', function () {
        this.retries(RETRIES.LONG);

        return checkElasticIP(dutPrimary)
            .catch(err => Promise.reject(err));
    });

    /*
    it('should check AWS route table routes for next hop matches primary (vm0)', function () {
        this.retries(RETRIES.LONG);

        return checkRouteTable(dutPrimary)
            .catch(err => Promise.reject(err));
    });
    */

    it('should force BIG-IP (primary) to standby', () => forceStandby(
        dutPrimary.ip, dutPrimary.username, dutPrimary.password
    ));

    it('should check that Elastic IP is mapped to secondary (vm1)', function () {
        this.retries(RETRIES.LONG);

        return checkElasticIP(dutSecondary)
            .catch(err => Promise.reject(err));
    });

    it('should force BIG-IP (secondary) to standby', () => forceStandby(
        dutSecondary.ip, dutSecondary.username, dutSecondary.password
    ));

    it('should check that Elastic IP is mapped to primary (vm0)', function () {
        this.retries(RETRIES.LONG);

        return checkElasticIP(dutPrimary)
            .catch(err => Promise.reject(err));
    });
});

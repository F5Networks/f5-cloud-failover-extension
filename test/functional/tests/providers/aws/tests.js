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

// Helper functions
function matchElasticIpToInstance(privateIp, instances) {
    let match = false;
    const primary = instances[dutPrimary.ip];

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
                    Name: 'tag-key',
                    Values: [
                        'F5_CLOUD_FAILOVER_LABEL'
                    ]
                },
                {
                    Name: 'tag:deploymentId',
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

    function checkElasticIP() {
        return getElasticIpPrivateAddress()
            .then((privateIp) => {
                matchElasticIpToInstance(privateIp, privateIpToInstance);
            })
            .catch(err => Promise.reject(err));
    }

    // Functional tests!

    // Test IP and Route failover
    it('should check that Elastic IP is mapped to primary (vm0)', function () {
        this.retries(RETRIES.LONG);

        return checkElasticIP()
            .catch(err => Promise.reject(err));
    });
});

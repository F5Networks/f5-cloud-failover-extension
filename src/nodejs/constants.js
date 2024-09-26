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

const fs = require('fs');
const path = require('path');

// the location of package.json changes when going from source control to the
// packaged iLX expected folder structure in the RPM - account for that here
let packageInfo;
try {
    /* eslint-disable global-require */
    /* eslint-disable import/no-unresolved */
    packageInfo = require('../package.json');
} catch (err) {
    packageInfo = require('../../package.json');
}

const PACKAGE_NAME = packageInfo.name;
const PACKAGE_VERSION = packageInfo.version;

const triggerScriptContents = fs.readFileSync(path.resolve(__dirname, './trigger.sh'), 'utf-8');

/**
 * Constants used across two or more files
 *
 * @module
 */
module.exports = {
    NAME: PACKAGE_NAME,
    VERSION: PACKAGE_VERSION,
    BASE_URL: 'https://localhost/mgmt/shared/cloud-failover',
    MGMT_PORTS: [
        443,
        8443
    ],
    CONTROLS_CLASS_NAME: 'Controls',
    CLOUD_PROVIDERS: {
        AWS: 'aws',
        AZURE: 'azure',
        GCP: 'gcp'
    },
    CONTROLS_PROPERTY_NAME: 'controls',
    ENDPOINTS: {
        CONFIG: 'declare',
        FAILOVER: 'failover',
        TASK: 'task'
    },
    FAILOVER_CLASS_NAME: 'Failover',
    FEATURE_FLAG_KEY_NAMES: {
        IP_FAILOVER: 'failoverAddresses',
        ROUTE_FAILOVER: 'failoverRoutes'
    },
    ENVIRONMENT_KEY_NAME: 'environment',
    LOCAL_HOST: 'localhost',
    METADATA_HOST: '169.254.169.254',
    API_HOST_EC2: 'ec2.amazonaws.com',
    API_HOST_S3: 's3.amazonaws.com',
    API_VERSION_EC2: '2016-11-15',
    API_VERSION_S3: '2006-03-01',
    MASK_REGEX: new RegExp('pass(word|phrase)', 'i'),
    PATHS: {
        tgactive: '/config/failover/tgactive',
        tgrefresh: '/config/failover/tgrefresh'
    },
    STATUS: {
        STATUS_OK: 'OK',
        STATUS_ERROR: 'ERROR',
        STATUS_ROLLING_BACK: 'ROLLING_BACK',
        STATUS_RUNNING: 'RUNNING'
    },
    TELEMETRY_TYPE: `${PACKAGE_NAME}-data`,
    TELEMETRY_TYPE_VERSION: '1',
    NAMELESS_CLASSES: [
    ],
    STORAGE_FOLDER_NAME: 'f5cloudfailover',
    STATE_FILE_NAME: 'f5cloudfailoverstate.json',
    FAILOVER_STATES: {
        NEVER_RUN: 'NEVER_RUN',
        PASS: 'SUCCEEDED',
        FAIL: 'FAILED',
        RUN: 'RUNNING'
    },
    BIGIP_STATUS: {
        ACTIVE: 'active',
        STANDBY: 'standby'
    },
    NIC_TAG: 'f5_cloud_failover_nic_map',
    ROUTE_NEXT_HOP_ADDRESS_TAG: 'f5_self_ips',
    AZURE_ENVIRONMENTS: {
        Azure: {
            name: 'Azure',
            portalUrl: 'https://portal.azure.com',
            publishingProfileUrl: 'http://go.microsoft.com/fwlink/?LinkId=254432',
            managementEndpointUrl: 'https://management.core.windows.net',
            resourceManagerEndpointUrl: 'https://management.azure.com/',
            sqlManagementEndpointUrl: 'https://management.core.windows.net:8443/',
            sqlServerHostnameSuffix: '.database.windows.net',
            galleryEndpointUrl: 'https://gallery.azure.com/',
            activeDirectoryEndpointUrl: 'https://login.microsoftonline.com/',
            activeDirectoryResourceId: 'https://management.core.windows.net/',
            activeDirectoryGraphResourceId: 'https://graph.windows.net/',
            batchResourceId: 'https://batch.core.windows.net/',
            activeDirectoryGraphApiVersion: '2013-04-05',
            storageEndpointSuffix: '.core.windows.net',
            keyVaultDnsSuffix: '.vault.azure.net'
        },
        AzureChina: {
            name: 'AzureChina',
            portalUrl: 'https://portal.azure.cn',
            publishingProfileUrl: 'http://go.microsoft.com/fwlink/?LinkID=301774',
            managementEndpointUrl: 'https://management.core.chinacloudapi.cn',
            resourceManagerEndpointUrl: 'https://management.chinacloudapi.cn/',
            sqlManagementEndpointUrl: 'https://management.core.chinacloudapi.cn:8443/',
            sqlServerHostnameSuffix: '.database.chinacloudapi.cn',
            galleryEndpointUrl: 'https://gallery.chinacloudapi.cn/',
            activeDirectoryEndpointUrl: 'https://login.chinacloudapi.cn/',
            activeDirectoryResourceId: 'https://management.core.chinacloudapi.cn/',
            activeDirectoryGraphResourceId: 'https://graph.chinacloudapi.cn/',
            batchResourceId: 'https://batch.chinacloudapi.cn/',
            activeDirectoryGraphApiVersion: '2013-04-05',
            storageEndpointSuffix: '.core.chinacloudapi.cn',
            keyVaultDnsSuffix: '.vault.azure.cn'
        },
        AzureUSGovernment: {
            name: 'AzureUSGovernment',
            portalUrl: 'https://portal.azure.us',
            publishingProfileUrl: 'https://manage.windowsazure.us/publishsettings/index',
            managementEndpointUrl: 'https://management.core.usgovcloudapi.net',
            resourceManagerEndpointUrl: 'https://management.usgovcloudapi.net/',
            sqlManagementEndpointUrl: 'https://management.core.usgovcloudapi.net:8443/',
            sqlServerHostnameSuffix: '.database.usgovcloudapi.net',
            galleryEndpointUrl: 'https://gallery.usgovcloudapi.net/',
            activeDirectoryEndpointUrl: 'https://login.microsoftonline.us/',
            activeDirectoryResourceId: 'https://management.core.usgovcloudapi.net/',
            activeDirectoryGraphResourceId: 'https://graph.windows.net/',
            batchResourceId: 'https://batch.core.usgovcloudapi.net/',
            activeDirectoryGraphApiVersion: '2013-04-05',
            storageEndpointSuffix: '.core.usgovcloudapi.net',
            keyVaultDnsSuffix: '.vault.usgovcloudapi.net'
        },
        AzureGermanCloud: {
            name: 'AzureGermanCloud',
            portalUrl: 'http://portal.microsoftazure.de/',
            publishingProfileUrl: 'https://manage.microsoftazure.de/publishsettings/index',
            managementEndpointUrl: 'https://management.core.cloudapi.de',
            resourceManagerEndpointUrl: 'https://management.microsoftazure.de/',
            sqlManagementEndpointUrl: 'https://management.core.cloudapi.de:8443/',
            sqlServerHostnameSuffix: '.database.cloudapi.de',
            galleryEndpointUrl: 'https://gallery.cloudapi.de/',
            activeDirectoryEndpointUrl: 'https://login.microsoftonline.de/',
            activeDirectoryResourceId: 'https://management.core.cloudapi.de/',
            activeDirectoryGraphResourceId: 'https://graph.cloudapi.de/',
            batchResourceId: 'https://batch.microsoftazure.de/',
            activeDirectoryGraphApiVersion: '2013-04-05',
            storageEndpointSuffix: '.core.cloudapi.de',
            keyVaultDnsSuffix: '.vault.microsoftazure.de'
        }
    },
    GCP_LABEL_NAME: 'f5_cloud_failover_labels',
    GCP_FWD_RULE_PAIR_LABEL: 'f5_target_instance_pair',
    AWS_VIPS_TAGS: ['f5_cloud_failover_vips', 'VIPS'], // keep VIPS for backwards compatability
    MAX_RETRIES: 50,
    RETRY_INTERVAL: 5000,
    MILLISECONDS_TO_MINUTES: 60000,
    TRIGGER_COMMENT: '# Autogenerated by F5 Failover Extension - Triggers failover',
    TRIGGER_COMMAND: triggerScriptContents,
    LEGACY_TRIGGER_COMMENT: '# Disabled by F5 Failover Extension',
    LEGACY_TRIGGER_COMMANDS: [
        '/usr/bin/f5-rest-node /config/cloud/azure/node_modules/@f5devcentral/f5-cloud-libs-azure/scripts/failoverProvider.js',
        '/usr/bin/f5-rest-node /config/cloud/gce/node_modules/@f5devcentral/f5-cloud-libs-gce/scripts/failover.js'
    ],
    STATE_FILE_RESET_MESSAGE: 'Failover state file was reset',
    CONTROLS_LOG_LEVEL: 'Log level control config posted',
    MISSING_CONTROLS_OBJECT: 'Body is missing controls object',
    INSPECT_ADDRESSES_AND_ROUTES: {
        instance: null,
        addresses: [],
        routes: []
    },
    LOG_LEVELS: {
        silly: 0,
        verbose: 1,
        debug: 2,
        info: 3,
        warning: 4,
        error: 5
    },
    XML_TEMPLATES: {
        AWS: {
            AssignIpv6Addresses: `<AssignIpv6AddressesResponse>
                    <networkInterfaceId>{{NetworkInterfaceId}}</networkInterfaceId>
                    <assignedIpv6Addresses></item c-bind="AssignedIpv6Addresses|array"></assignedIpv6Addresses>
                </AssignIpv6AddressesResponse>`,
            AssignPrivateIpAddresses: `<AssignPrivateIpAddressesResponse>
                    <networkInterfaceId>{{NetworkInterfaceId}}</networkInterfaceId>
                    <assignedPrivateIpAddressesSet><item c-bind="AssignedPrivateIpAddresses|array">
                        <privateIpAddress>{{PrivateIpAddress}}</privateIpAddress>
                    </item></assignedPrivateIpAddressesSet>
                    <return>{{Return}}</return>
                </AssignPrivateIpAddressesResponse>`,
            AssociateAddress: `<AssociateAddressResponse>
                    <return>{{Return}}</return>
                    <associationId>{{AssociationId}}</associationId>
                </AssociateAddressResponse>`,
            DescribeAddresses: `<DescribeAddressesResponse>
                    <addressesSet><item c-bind="Addresses|array">
                        <publicIp>{{PublicIp}}</publicIp>
                        <allocationId>{{AllocationId}}</allocationId>
                        <associationId>{{AssociationId}}</associationId>
                        <privateIpAddress>{{PrivateIpAddress}}</privateIpAddress>
                        <domain>{{Domain}}</domain>
                        <instanceId>{{InstanceId}}</instanceId>
                        <networkInterfaceId>{{NetworkInterfaceId}}</networkInterfaceId>
                        <networkInterfaceOwnerId>{{NetworkInterfaceOwnerId}}</networkInterfaceOwnerId>
                        <publicIpv4Pool>{{PublicIpv4Pool}}</publicIpv4Pool>
                        <networkBorderGroup>{{NetworkBorderGroup}}</networkBorderGroup>
                        <tagSet><item c-bind="Tags|array">
                            <key>{{Key}}</key>
                            <value>{{Value}}</value>
                        </item></tagSet>
                    </item></addressesSet>
                </DescribeAddressesResponse>`,
            DescribeInstances: `<DescribeInstancesResponse><reservationSet><item c-bind="Reservations|array">
                    <instancesSet><item c-bind="Instances|array">
                        <instanceId>{{InstanceId}}</instanceId>
                        <imageId>{{ImageId}}</imageId>
                        <instanceState c-bind="InstanceState|object">
                            <code>{{Code}}</code>
                            <name>{{Name}}</name>
                        </instanceState>
                        <privateDnsName>{{PrivateDnsName}}</privateDnsName>
                        <dnsName>{{DnsName}}</dnsName>
                        <keyName>{{KeyName}}</keyName>
                        <amiLaunchIndex>{{AmiLaunchIndex}}</amiLaunchIndex>
                        <productCodes><item c-bind="ProductCodes|array">
                            <productCode>{{ProductCode}}</productCode>
                            <type>{{Type}}</type>
                        </item></productCodes>
                        <instanceType>{{InstanceType}}</instanceType>
                        <launchTime>{{LaunchTime}}</launchTime>
                        <placement c-bind="Placement|object">
                            <availabilityZone>{{AvailabilityZone}}</availabilityZone>
                            <tenancy>{{Tenancy}}</tenancy>
                        </placement>
                        <monitoring c-bind="Monitoring|object">
                            <state>{{State}}</state>
                        </monitoring>
                        <subnetId>{{SubnetId}}</subnetId>
                        <vpcId>{{VpcId}}</vpcId>
                        <privateIpAddress>{{PrivateIpAddress}}</privateIpAddress>
                        <ipAddress>{{IpAddress}}</ipAddress>
                        <sourceDestCheck>{{SourceDestCheck}}</sourceDestCheck>
                        <groupSet><item c-bind="Groups|array">
                            <groupId>{{GroupId}}</groupId>
                            <groupName>{{GroupName}}</groupName>
                        </item></groupSet>
                        <architecture>{{Architecture}}</architecture>
                        <rootDeviceType>{{RootDeviceType}}</rootDeviceType>
                        <rootDeviceName>{{RootDeviceName}}</rootDeviceName>
                        <blockDeviceMapping><item c-bind="BlockDeviceMappings|array">
                            <deviceName>{{DeviceName}}</deviceName>
                            <ebs c-bind="Ebs|object">
                                <volumeId>{{VolumeId}}</volumeId>
                                <status>{{Status}}</status>
                                <attachTime>{{AttachTime}}</attachTime>
                                <deleteOnTermination>{{DeleteOnTermination}}</deleteOnTermination>
                            </ebs>
                        </item></blockDeviceMapping>
                        <virtualizationType>{{VirtualizationType}}</virtualizationType>
                        <clientToken>{{ClientToken}}</clientToken>
                        <tagSet><item c-bind="Tags|array">
                            <key>{{Key}}</key>
                            <value>{{Value}}</value>
                        </item></tagSet>
                        <hypervisor>{{Hypervisor}}</hypervisor>
                        <networkInterfaceSet><item c-bind="NetworkInterfaces|array">
                            <networkInterfaceId>{{NetworkInterfaceId}}</networkInterfaceId>
                            <privateIpAddress>{{PrivateIpAddress}}</privateIpAddress>
                            <privateIpAddressesSet><item c-bind="PrivateIpAddresses|array">
                                <privateIpAddress>{{PrivateIpAddress}}</privateIpAddress>
                                <association c-bind="Association|object">
                                    <publicIp>{{PublicIp}}</publicIp>
                                    <publicDnsName>{{PublicDnsName}}</publicDnsName>
                                    <ipOwnerId>{{IpOwnerId}}</ipOwnerId>
                                </association>
                                <privateDnsName>{{PrivateDnsName}}</privateDnsName>
                                <primary>{{Primary}}</primary>
                            </item></privateIpAddressesSet>
                            <ipv6AddressesSet c-bind="Ipv6Addresses|array"><item>
                                    <ipv6Address>{{Ipv6Address}}</ipv6Address>
                                    <isPrimaryIpv6>{{IsPrimaryIpv6}}</isPrimaryIpv6>
                            </item></ipv6AddressesSet>
                            <interfaceType>{{InterfaceType}}</interfaceType>
                            <subnetId>{{SubnetId}}</subnetId>
                            <vpcId>{{VpcId}}</vpcId>
                            <description>{{Description}}</description>
                            <ownerId>{{OwnerId}}</ownerId>
                            <status>{{Status}}</status>
                            <association c-bind="Association|object">
                                <publicIp>{{PublicIp}}</publicIp>
                                <publicDnsName>{{PublicDnsName}}</publicDnsName>
                                <ipOwnerId>{{IpOwnerId}}</ipOwnerId>
                            </association>
                            <macAddress>{{MacAddress}}</macAddress>
                            <privateDnsName>{{PrivateDnsName}}</privateDnsName>
                            <sourceDestCheck>{{SourceDestCheck}}</sourceDestCheck>
                            <groupSet><item c-bind="Groups|array">
                                <groupId>{{GroupId}}</groupId>
                                <groupName>{{GroupName}}</groupName>
                            </item></groupSet>
                            <attachment c-bind="Attachment|object">
                                <attachmentId>{{AttachmentId}}</attachmentId>
                                <deviceIndex>{{DeviceIndex}}</deviceIndex>
                                <attachTime>{{AttachTime}}</attachTime>
                                <deleteOnTermination>{{DeleteOnTermination}}</deleteOnTermination>
                                <networkCardIndex>{{NetworkCardIndex}}</networkCardIndex>
                            </attachment>
                        </item></networkInterfaceSet>
                        <iamInstanceProfile>
                            <arn>{{Arn}}</arn>
                            <id>{{Id}}</id>
                        </iamInstanceProfile>
                        <ebsOptimized>{{EbsOptimized}}</ebsOptimized>
                        <enaSupport>{{EnaSupport}}</enaSupport>
                        <cpuOptions c-bind="CpuOptions|object">
                            <coreCount>{{CoreCount}}</coreCount>
                            <threadsPerCore>"{{ThreadsPerCore}}"</threadsPerCore>
                        </cpuOptions>
                        <capacityReservationSpecification c-bind="CapacityReservationSpecification|object">
                            <capacityReservationPreference>{{CapacityReservationPreference}}</capacityReservationPreference>
                        </capacityReservationSpecification>
                        <hibernationOptions c-bind="HibernationOptions|object">
                            <configured>{{Configured}}</configured>
                        </hibernationOptions>
                        <enclaveOptions c-bind="EnclaveOptions|object">
                            <enabled>{{Enabled}}</enabled>
                        </enclaveOptions>
                        <metadataOptions c-bind="MetadataOptions|object">
                            <state>{{State}}</state>
                            <httpTokens>{{HttpTokens}}</httpTokens>
                            <httpPutResponseHopLimit>{{HttpPutResponseHopLimit}}</httpPutResponseHopLimit>
                            <httpEndpoint>{{HttpEndpoint}}</httpEndpoint>
                            <httpProtocolIpv4>{{HttpProtocolIpv4}}</httpProtocolIpv4>
                            <httpProtocolIpv6>{{HttpProtocolIpv6}}</httpProtocolIpv6>
                            <instanceMetadataTags>{{InstanceMetadataTags}}</instanceMetadataTags>
                        </metadataOptions>
                        <maintenanceOptions c-bind="MaintenanceOptions|object">
                            <autoRecovery>{{AutoRecovery}}</autoRecovery>
                        </maintenanceOptions>
                        <currentInstanceBootMode>{{CurrentInstanceBootMode}}</currentInstanceBootMode>
                        <platformDetails>{{PlatformDetails}}</platformDetails>
                        <usageOperation>{{UsageOperation}}</usageOperation>
                        <usageOperationUpdateTime>{{UsageOperationUpdateTime}}</usageOperationUpdateTime>
                        <privateDnsNameOptions c-bind="PrivateDnsNameOptions|object">
                            <hostnameType>{{HostnameType}}</hostnameType>
                            <enableResourceNameDnsARecord>{{EnableResourceNameDnsARecord}}</enableResourceNameDnsARecord>
                            <enableResourceNameDnsAAAARecord>{{EnableResourceNameDnsAAAARecord}}</enableResourceNameDnsAAAARecord>
                        </privateDnsNameOptions>
                    </item></instancesSet>
                </item></reservationSet></DescribeInstancesResponse>`,
            DescribeNetworkInterfaces: `<DescribeNetworkInterfacesResponse>
                    <networkInterfaceSet><item c-bind="NetworkInterfaces|array">
                        <networkInterfaceId>{{NetworkInterfaceId}}</networkInterfaceId>
                        <privateIpAddress>{{PrivateIpAddress}}</privateIpAddress>
                        <privateIpAddressesSet><item c-bind="PrivateIpAddresses|array">
                            <privateIpAddress>{{PrivateIpAddress}}</privateIpAddress>
                            <primary>{{Primary}}</primary>
                            <association><publicIp>{{Association.PublicIp}}</publicIp></association>
                        </item></privateIpAddressesSet>
                        <tagSet><item c-bind="TagSet|array">
                            <key>{{Key}}</key>
                            <value>{{Value}}</value>
                        </item></tagSet>
                        <subnetId>{{SubnetId}}</subnetId>
                        <ipv6AddressesSet><item c-bind="Ipv6Addresses|array">
                            <ipv6Address>{{Ipv6Address}}</ipv6Address>
                        </item></ipv6AddressesSet>
                    </item></networkInterfaceSet>
                </DescribeNetworkInterfacesResponse>`,
            DescribeRouteTables: `<DescribeRouteTablesResponse>
                    <routeTableSet><item c-bind="RouteTables|array">
                        <routeTableId>{{RouteTableId}}</routeTableId>
                        <vpcId>{{VpcId}}</vpcId>
                        <ownerId>{{OwnerId}}</ownerId>
                        <routeSet><item c-bind="Routes|array">
                            <destinationCidrBlock>{{DestinationCidrBlock}}</destinationCidrBlock>
                            <instanceId>{{InstanceId}}</instanceId>
                            <instanceOwnerId>{{InstanceOwnerId}}</instanceOwnerId>
                            <networkInterfaceId>{{NetworkInterfaceId}}</networkInterfaceId>
                            <destinationIpv6CidrBlock>{{DestinationIpv6CidrBlock}}</destinationIpv6CidrBlock>
                            <gatewayId>igw-{{GatewayId}}</gatewayId>
                            <state>{{Active}}</state>
                            <origin>{{Origin}}</origin>
                        </item></routeSet>
                        <associationSet><item c-bind="Associations|array">
                            <routeTableAssociationId>{{RouteTableAssociationId}}</routeTableAssociationId>
                            <routeTableId>{{RouteTableId}}</routeTableId>
                            <subnetId>{{SubnetId}}</subnetId>
                            <main>{{Main}}</main>
                            <associationState><state>{{AssociationState.State}}</state></associationState>
                        </item></associationSet>
                        <tagSet><item c-bind="Tags|array">
                            <key>{{Key}}</key>
                            <value>{{Value}}</value>
                        </item></tagSet>
                    </item></routeTableSet>
                </DescribeRouteTablesResponse>`,
            DescribeSubnets: `<DescribeSubnetsResponse>
                    <subnetSet><item c-bind="Subnets|array">
                        <subnetId>subnet-{{SubnetId}}</subnetId>
                        <subnetArn>{{SubnetArn}}</subnetArn>
                        <state>{{State}}</state>
                        <ownerId>{{OwnerId}}</ownerId>
                        <vpcId>{{VpcId}}</vpcId>
                        <cidrBlock>{{CidrBlock}}</cidrBlock>
                        <ipv6CidrBlockAssociationSet><item c-bind="Ipv6CidrBlockAssociationSet|array">
                            <ipv6CidrBlock>{{Ipv6CidrBlock}}</ipv6CidrBlock>
                            <associationId>{{AssociationId}}</associationId>
                            <ipv6CidrBlockState><state>{{Ipv6CidrBlockState.State}}</state></ipv6CidrBlockState>
                        </item></ipv6CidrBlockAssociationSet>
                        <tagSet><item c-bind="Tags|array">
                            <key>{{Key}}</key>
                            <value>{{Value}}</value>
                        </item></tagSet>
                        <availableIpAddressCount>{{AvailableIpAddressCount}}</availableIpAddressCount>
                        <availabilityZone>{{AvailabilityZone}}</availabilityZone>
                        <availabilityZoneId>{{AvailabilityZoneId}}</availabilityZoneId>
                        <defaultForAz>{{DefaultForAz}}</defaultForAz>
                        <mapPublicIpOnLaunch>{{MapPublicIpOnLaunch}}</mapPublicIpOnLaunch>
                        <assignIpv6AddressOnCreation>{{AssignIpv6AddressOnCreation}}</assignIpv6AddressOnCreation>
                        <mapCustomerOwnedIpOnLaunch>{{MapCustomerOwnedIpOnLaunch}}</mapCustomerOwnedIpOnLaunch>
                        <privateDnsNameOptionsOnLaunch c-bind="PrivateDnsNameOptionsOnLaunch|object">
                            <hostnameType>{{HostnameType}}</hostnameType>
                            <enableResourceNameDnsARecord>{{EnableResourceNameDnsARecord}}</enableResourceNameDnsARecord>
                            <enableResourceNameDnsAAAARecord>{{EnableResourceNameDnsAAAARecord}}</enableResourceNameDnsAAAARecord>
                        </privateDnsNameOptionsOnLaunch>
                        <ipv6Native>{{Ipv6Native}}</ipv6Native>
                        <enableDns64>{{EnableDns64}}</enableDns64>
                    </item></subnetSet>
                </DescribeSubnetsResponse>`,
            DisassociateAddress: `<DisassociateAddress>
                    <return>{{Return}}</return>
                </DisassociateAddress>`,
            ReplaceRoute: `<ReplaceRouteResponse>
                    <return>{{Return}}</return>
                </ReplaceRouteResponse>`,
            UnassignIpv6Addresses: `<UnassignIpv6AddressesResponse>
                    <networkInterfaceId>{{NetworkInterfaceId}}</networkInterfaceId>
                    <unassignedIpv6Addresses></item c-bind="UnassignedIpv6Addresses|array"></unassignedIpv6Addresses>
                </UnassignIpv6AddressesResponse>`,
            UnassignPrivateIpAddresses: `<UnassignPrivateIpAddresses>
                    <return>{{Return}}</return>
                </UnassignPrivateIpAddresses>`
        }
    }
};

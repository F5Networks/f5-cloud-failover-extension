# f5-cloud-failover
[![Slack Status](https://f5cloudsolutions.herokuapp.com/badge.svg)](https://f5cloudsolutions.herokuapp.com)
[![Releases](https://img.shields.io/github/release/f5devcentral/f5-cloud-failover-extension.svg)](https://github.com/f5devcentral/f5-cloud-failover-extension/releases)
[![Issues](https://img.shields.io/github/issues/f5devcentral/f5-cloud-failover-extension.svg)](https://github.com/f5devcentral/f5-cloud-failover-extension/issues)

## Introduction

The F5 Cloud Failover Extension (CF) is an iControl LX extension that provides L3 failover functionality in cloud environments, effectively replacing Gratuitous ARP (GARP). Cloud Failover uses a declarative model, meaning you provide a JSON declaration using a single REST API call. The declaration represents the configuration that Cloud Failover is responsible for creating on a BIG-IP system.

### How does it work?

In the event of a failover between BIG-IP systems, BIG-IP fails a traffic group over, which runs the /config/failover/tgactive script. The Cloud Failover Extension updates that file during any configuration request to ensure it triggers failover by calling the Cloud Failover /trigger API. During a failover event, CF then moves or updates cloud resources as described below:

* Failover IP(s): The extension updates IP configurations between NICs, updates EIP/private IP associations, and updates forwarding rule target instances.
* Failover Routes: The extension updates Azure User-Defined Routes (UDR), AWS route tables, and GCP forwarding rule targets to point to a self IP address of the active BIG-IP device.
* Failback: The extension reverts to using the designated primary BIG-IP when it becomes active again.

### Why use Cloud Failover Extension?

Using Cloud Failover Extension has three main benefits:

* Standardization: Failover patterns will look similar across all clouds.
* Portability: You can leverage a variety of methods, including cloud-native templates, Terraform, and Ansible, to install and run CF.
* Lifecycle and Supportability: You can upgrade BIG-IP without having to call F5 support to fix failover.
Use the following links, the navigation on the left, and/or the Next and Previous buttons to explore the documentation.

## Documentation

For the documentation on Cloud Failover, including download, installation, and usage instructions, see the Cloud Failover User guides at [https://clouddocs.f5.com/products/extensions/f5-cloud-failover/latest/](https://clouddocs.f5.com/products/extensions/f5-cloud-failover/latest/).

## Filing Issues and Getting Help

If you come across a bug or other issue when using Cloud Failover, use [GitHub Issues](https://github.com/f5devcentral/f5-cloud-failover-extension/issues) to submit an issue for our team.  You can also see the current known issues on that page, which are tagged with a purple Known Issue label.  

Be sure to see the [Support page](SUPPORT.md) in this repo for more details and supported versions of Cloud Failover.

## Copyright

Copyright 2014-2019 F5 Networks Inc.

### F5 Networks Contributor License Agreement

Before you start contributing to any project sponsored by F5 Networks, Inc. (F5) on GitHub, you will need to sign a Contributor License Agreement (CLA).  

If you are signing as an individual, we recommend that you talk to your employer (if applicable) before signing the CLA since some employment agreements may have restrictions on your contributions to other projects. Otherwise by submitting a CLA you represent that you are legally entitled to grant the licenses recited therein.  

If your employer has rights to intellectual property that you create, such as your contributions, you represent that you have received permission to make contributions on behalf of that employer, that your employer has waived such rights for your contributions, or that your employer has executed a separate CLA with F5.

If you are signing on behalf of a company, you represent that you are legally entitled to grant the license recited therein. You represent further that each employee of the entity that submits contributions is authorized to submit such contributions on behalf of the entity pursuant to the CLA.

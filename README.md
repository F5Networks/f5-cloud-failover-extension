# F5 BIG-IP Cloud Failover extension for AWS, Azure, and GCP
[![Releases](https://img.shields.io/github/release/f5networks/f5-cloud-failover-extension.svg)](https://github.com/f5networks/f5-cloud-failover-extension/releases)
[![Issues](https://img.shields.io/github/issues/f5networks/f5-cloud-failover-extension.svg)](https://github.com/f5networks/f5-cloud-failover-extension/issues)


**Please Note:**  F5 BIG-IP Cloud Failover Extension is entering a phase of ongoing maintenance and support. 
A product in maintenance mode continues to receive support and ensures its stability with regular critical fixes and security updates. 
This maintenance approach helps maintain the longevity and reliability of the product for the long term. 
Enhancement requests for this product will be evaluated on an individual basis, taking into consideration their overall impact and alignment with our business objectives. 
Only those with a strong case for improvement will be considered for implementation. **There is no plan to deprecate this product.**


## Introduction

The F5 BIG-IP Cloud Failover Extension (CFE) for AWS, Azure, and GCP is an iControl LX extension that provides L3 failover functionality in cloud environments, effectively replacing Gratuitous ARP (GARP). Cloud Failover uses a declarative model, meaning you provide a JSON declaration using a single REST API call. The declaration represents the configuration that Cloud Failover is responsible for creating on a BIG-IP system.

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

### Where can I download Cloud Failover Extension?

Cloud Failover Extension RPM and checksum files can be found in the [Releases section](https://github.com/f5networks/f5-cloud-failover-extension/releases), under Assets.

## Documentation

For the documentation on Cloud Failover, including download, installation, and usage instructions, see the [Cloud Failover Extension User guide](https://clouddocs.f5.com/products/extensions/f5-cloud-failover/latest/).

## Filing Issues and Getting Help

If you come across a bug or other issue when using Cloud Failover, use [GitHub Issues](https://github.com/f5networks/f5-cloud-failover-extension/issues) to submit an issue for our team.  You can also see the current known issues on that page, which are tagged with a purple Known Issue label.  

Starting with v1.2.0, the Cloud Failover Extension moved from a community support based model to a traditional F5 support module. This means you can get assistance if necessary from F5 Technical Support.

For more information, see the [Support page](SUPPORT.md).

## Copyright

Copyright 2014-2022 F5 Networks Inc.

### F5 Networks Contributor License Agreement

Before you start contributing to any project sponsored by F5 Networks, Inc. (F5) on GitHub, you will need to sign a Contributor License Agreement (CLA).  

If you are signing as an individual, we recommend that you talk to your employer (if applicable) before signing the CLA since some employment agreements may have restrictions on your contributions to other projects. Otherwise by submitting a CLA you represent that you are legally entitled to grant the licenses recited therein.  

If your employer has rights to intellectual property that you create, such as your contributions, you represent that you have received permission to make contributions on behalf of that employer, that your employer has waived such rights for your contributions, or that your employer has executed a separate CLA with F5.

If you are signing on behalf of a company, you represent that you are legally entitled to grant the license recited therein. You represent further that each employee of the entity that submits contributions is authorized to submit such contributions on behalf of the entity pursuant to the CLA.

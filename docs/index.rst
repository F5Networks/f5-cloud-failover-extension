F5 Cloud Failover
=================

Welcome to the F5 Cloud Failover User Guide. To provide feedback on this documentation, you can file a |github|.

Introduction
------------

The F5 Cloud Failover Extension (CF) is an iControl LX extension that provides L3 failover functionality in cloud environments, effectively replacing Gratuitous ARP (GARP). Cloud Failover uses a declarative model, meaning you provide a JSON declaration using a single REST API call. The declaration represents the configuration that Cloud Failover is responsible for creating on a BIG-IP system.

How does it work?
`````````````````
In the event of a failover between BIG-IP systems, BIG-IP fails a traffic group over, which runs the `/config/failover/tgactive` script. The Cloud Failover Extension updates that file during any configuration request to ensure it triggers failover by calling the Cloud Failover /trigger API. During a failover event, CF then moves or updates cloud resources as described below:

- **Failover IP(s)**: The extension updates IP configurations between NICs, updates EIP/private IP associations, and updates forwarding rule target instances.
- **Failover Routes**: The extension updates Azure User-Defined Routes (UDR), AWS route tables, and GCP forwarding rule targets to point to a self IP address of the active BIG-IP device.
- **Failback**: The extension reverts to using the designated primary BIG-IP when it becomes active again.


The diagram below shows a typical failover scenario for an active/standby pair of BIG-IPs in an :ref:`azure` cloud environment. To see how Cloud Failover Extension works in other cloud environments, see the corresponding sections for :ref:`aws` and :ref:`gcp`.


.. image:: images/azure/AzureFailoverExtensionHighLevel.gif
  :width: 800


Why use Cloud Failover Extension?
`````````````````````````````````
Using Cloud Failover Extension has three main benefits:

- Standardization: Failover patterns will look similar across all clouds.
- Portability: You can leverage a variety of methods, including cloud-native templates, Terraform, and Ansible, to install and run CF.
- Lifecycle and Supportability: You can upgrade BIG-IP without having to call F5 support to fix failover.

Use the following links, the navigation on the left, and/or the Next and Previous buttons to explore the documentation.

User Guide Index
----------------

.. toctree::
   :maxdepth: 2
   :includehidden:
   :glob:

   userguide/prereqs
   userguide/faq
   userguide/quickstart
   userguide/installation
   userguide/azure
   userguide/aws
   userguide/gcp
   userguide/example-declarations
   userguide/troubleshooting
   revision-history



.. |github| raw:: html

   <a href="https://github.com/F5Devcentral/f5-cloud-failover-extension/issues" target="_blank">GitHub Issue</a>
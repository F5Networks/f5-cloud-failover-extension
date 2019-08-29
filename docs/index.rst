F5 Cloud Failover
=================

Welcome to the F5 Cloud Failover User Guide. To provide feedback on this documentation, you can file a `GitHub Issue <https://github.com/f5networks/f5-cloud-failover/issues>`.

Introduction
------------

F5 Cloud Failover (CF) is a solution for those who want L3 failover functionality for their BIG-IP systems in a cloud environment. F5 Cloud Failover uses an iControl LX extension to provide this functionality, effectively replacing Gratuitous ARP (GARP), by moving or updating certain cloud resources during a failover event, as described below.

- Failover IP(s) - Update IP configurations on a NIC, update EIP associations, update forwarding rule target instance, etc.
- Failover Route(s) - Update User-Defined Routes (UDR), update route table, etc.

Cloud Failover 

The diagram below shows a typical failover scenario for an active/standby pair of BIG-IP systems in an Azure cloud environment.


.. image:: ../contributing/images/AWSFailoverExtensionHighLevel.gif
  :width: 800



Each cloud provider has different requirements in terms of cloud resources. To see how Cloud Failover works for the different providers, see the sections for Azure, AWS, and Google.

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
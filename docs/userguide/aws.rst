.. _aws:

Amazon Web Services
===================

Failover Event Diagram
----------------------

.. image:: ../contributing/images/AWSFailoverExtensionHighLevel.gif
  :width: 800

Prerequisites
-------------

- 2 clustered BIG-IP systems in AWS
- Virtual addresses created, corresponding to Secondary Private IP addresses on the BIG-IP NICs serving application traffic
- Elastic IP addresses, tagged with:
    - the key(s) and values(s) from the addressTags section in the Failover Extension Configuration request
    - the private IP addresses that each Elastic IP is associated with, separated by a comma. For example: 
    .. image:: ../contributing/images/AWSEIPTags.png

Example Declaration
-------------------
.. _azure:

Cloud Failover in Microsoft Azure
=================================


Failover Event Diagram
----------------------

This diagram shows a failover event with Cloud Failover implemented in Microsoft Azure. IP configuration(s) with a secondary private address that matches a virtual address in a traffic group owned by the active BIG-IP are deleted and recreated on that device's network interface(s). User-defined routes with a destination and parent route table with tags matching the Failover Extension configuration are updated with a next hop attribute that corresponds to the self-IP address of the active BIG-IP.

.. image:: ../images/AzureFailoverExtensionHighLevel.gif
  :width: 800

Prerequisites
-------------
These are the minimum requirements for setting up Cloud Failover in Microsoft Azure:

- 2 clustered BIG-IPs
   - Note: Here is an [example ARM Template](https://github.com/F5Networks/f5-azure-arm-templates/blob/master/supported/failover/same-net/via-api/n-nic/existing-stack/payg), although this is not required.  Any configuration tool can be used to provision the resources.
- An Azure system-assigned or user-managed identity with sufficient access
    - Using Standard roles
        - Contributor access - Note: This should be limited to the appropriate resource groups
- Storage account for Cloud Failover extension cluster-wide file(s)
    - Tagged with a key/value corresponding to the key/value(s) provided in the `externalStorage.scopingTags` section of the Cloud Failover extension configuration
    - Note: Ensure that the required storage accounts have no public access
- Network Interfaces should be tagged with a key/value corresponding to the key/value(s) provided in the `failoverAddresses.scopingTags` section of the Cloud Failover extension configuration
- Virtual addresses created in a traffic group (floating) and matching addresses (secondary) on the IP configurations of the instance NICs serving application traffic
- Route(s) in a route table tagged with the following (optional):
    - Tagged with a key/value corresponding to the key/value(s) provided in the `failoverRoutes.scopingTags` section of the Cloud Failover extension configuration
    - Tagged with a special key call `f5_self_ips` containing a comma seperated list of addresses mapping to a self IP address on each instance in the cluster that the routes should be pointed at. Example: `10.0.0.10,10.0.0.11`
    - Note: The failover extension configuration `failoverRoutes.scopingAddressRanges` should contain a list of destination routes to update


.. _azure-example:

Example Declaration
-------------------
This example declaration shows the minimum information needed to update the cloud resources in Azure.

.. code-block:: json
    :linenos:


    {
        "class": "Cloud_Failover",
        "environment": "azure",
        "externalStorage": {
            "scopingTags": {
              "f5_cloud_failover_label": "mydeployment"
            }
        },
        "failoverAddresses": {
            "scopingTags": {
              "f5_cloud_failover_label": "mydeployment"
            }
        },
        "failoverRoutes": {
          "scopingTags": {
            "f5_cloud_failover_label": "mydeployment"
          },
          "scopingAddressRanges": [
            "192.168.1.0/24"
          ]
        }
    }


.. |github| raw:: html

   <a href="https://github.com/F5Networks/f5-azure-arm-templates/tree/master/supported/failover/same-net/via-api/n-nic/existing-stack/payg" target="_blank">Github</a>

.. |armtemplate| raw:: html

   <a href="https://github.com/F5Networks/f5-azure-arm-templates/blob/master/supported/failover/same-net/via-api/n-nic/existing-stack/payg" target="_blank">example ARM template</a>
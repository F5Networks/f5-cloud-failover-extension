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

- 2 clustered BIG-IPs in Azure, see the |armtemplate|.
- An Azure system-assigned or user-managed identity with Contributor role to the virtual machines and resource group where network interfaces and route tables are configured
- Network access to the Azure metadata service
- Virtual addresses created in a floating traffic group and matching Secondary Private IP addresses on the IP configurations of the BIG-IP NICs serving application traffic
- The aforementioned Azure network interfaces tagged with the key(s) and value(s) from the *failoverAddresses.scopingTags* section in the Cloud Failover extension configuration
- Route table(s) tagged with the following:
    - The key(s) and value(s) from the *failoverRoutes.scopingTags* section in the Cloud Failover extension configuration
    - Key(s) named *f5_self_ips* with value(s) matching the self IP address(es) from the BIG-IP devices
- Route(s) in the route table with destination networks corresponding to the values from the *failoverRoutes.scopingAddressRanges* section in the Failover Extension Configuration request


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

    

Example Response
----------------
After you post the declaration to the BIG-IP, it will respond with a success message. Below is an example response.

.. code-block:: json
    :linenos:

    {
        "message": "success",
        "declaration": {
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
    }


.. |github| raw:: html

   <a href="https://github.com/F5Networks/f5-azure-arm-templates/tree/master/supported/failover/same-net/via-api/n-nic/existing-stack/payg" target="_blank">Github</a>

.. |armtemplate| raw:: html

   <a href="https://github.com/F5Networks/f5-azure-arm-templates/blob/master/supported/failover/same-net/via-api/n-nic/existing-stack/payg" target="_blank">example ARM template</a>
.. _gcp:

Cloud Failover in Google Cloud
==============================



Failover Event Diagram
----------------------

In the event of a failover, alias IPs are updated to point to the network interface of the active BIG-IP device. 

The forwarding rule targets matching a self IP address of the active BIG-IP device are associated with the network interface of the active BIG-IP device.

.. image:: ../images/GCPFailoverExtensionHighLevel.gif
  :width: 800



Prerequisites
-------------
These are the minimum requirements for setting up Cloud Failover in Google Cloud Platform:

- 2 clustered BIG-IP systems in GCE. See example ARM templates on |github|.
- Network access to the Google metadata service
- A Google service account with sufficent access to update the indicated virtual machines and forwarding rules
- Virtual addresses created in a named traffic group and matching *Alias IP* addresses on the BIG-IP NICs serving application traffic
- Virtual machine instances tagged with the key(s) and value(s) from the *addressTags* section in the Failover Extension Configuration request
- Forwarding rules(s) configured with targets that match the self IP address of the active BIG-IP


Example Declaration
-------------------
This example declaration shows the minimum information needed to update the cloud resources in Google Cloud.

.. code-block:: json
    :linenos:


    {
        "class": "Cloud_Failover",
        "environment": "gcp",
          "externalStorage": {
            "scopingTags": {
              "F5_CLOUD_FAILOVER_LABEL": "mydeployment"
            }
        },
          "failoverAddresses": {
            "scopingTags": {
              "F5_CLOUD_FAILOVER_LABEL": "mydeployment"
            }
        },
        "failoverRoutes": {
          "scopingTags": {
            "F5_CLOUD_FAILOVER_LABEL": "mydeployment"
          },
          "scopingAddressRanges": [
            "192.168.1.0/24"
          ]
        }
    }

    




.. |github| raw:: html

   <a href="https://github.com/F5Networks/f5-google-gdm-templates/tree/master/supported/failover/same-net/via-api/3nic/existing-stack/payg" target="_blank">F5 Cloud Failover site on GitHub</a>
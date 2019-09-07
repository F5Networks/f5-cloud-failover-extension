.. _gcp:

Cloud Failover in Google Cloud
==============================



Failover Event Diagram
----------------------

This diagram shows a failover event with Cloud Failover implemented in GCP. In the event of a failover, alias IPs are updated to point to the network interface of the active BIG-IP device. The forwarding rule targets matching a self IP address of the active BIG-IP device are associated with the network interface of the active BIG-IP device.

.. image:: ../images/GCPFailoverExtensionHighLevel.gif
  :width: 800



Prerequisites
-------------
These are the minimum requirements for setting up Cloud Failover in Google Cloud Platform:

- 2 clustered BIG-IPs
   - Note: Here is an [example GDM Template](https://github.com/F5Networks/f5-google-gdm-templates/tree/master/supported/failover/same-net/via-api/3nic/existing-stack/payg), although this is not required.  Any configuration tool can be used to provision the resources.
- A Google service account with sufficent access
    - Using Standard scopes
        - compute-rw
        - storage-rw
        - cloud-platform
- Storage bucket for Cloud Failover extension cluster-wide file(s)
    - Tagged with a key/value corresponding to the key/value(s) provided in the `externalStorage.scopingTags` section of the Cloud Failover extension configuration
- Instances should be tagged with a key/value corresponding to the key/value(s) provided in the `failoverAddresses.scopingTags` section of the Cloud Failover extension configuration
- Virtual addresses created in a traffic group (floating) and matching Alias IP addresses on the instance serving application traffic
- Forwarding rules(s) configured with targets that match a virtual address or floating self IP on the instance serving application traffic
- Route(s) in a route table tagged with the following (optional):
    - Tagged with a key/value corresponding to the key/value(s) provided in the `failoverRoutes.scopingTags` section of the Cloud Failover extension configuration
    - Tagged with a special key call `f5_self_ips` containing a comma seperated list of addresses mapping to a self IP address on each instance in the cluster that the routes should be pointed at. Example: `10.0.0.10,10.0.0.11`
    - Note: The failover extension configuration `failoverRoutes.scopingAddressRanges` should contain a list of destination routes to update

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

   <a href="https://github.com/F5Networks/f5-google-gdm-templates/tree/master/supported/failover/same-net/via-api/3nic/existing-stack/payg" target="_blank">F5 Cloud Failover site on GitHub</a>

.. |gdmtemplate| raw:: html

   <a href="https://github.com/F5Networks/f5-google-gdm-templates/tree/master/supported/failover/same-net/via-api/3nic/existing-stack/payg" target="_blank">example GDM Template</a>
.. _aws:

AWS
===

Failover Event Diagram
----------------------

This diagram shows a failover event with Cloud Failover implemented in AWS. You can see Elastic IP addresses with matching tags are associated with the secondary private IP matching the virtual address corresponding to the active BIG-IP device. Route targets with destinations matching the Failover Extension configuration are updated with the network interface of the active BIG-IP device.

.. image:: ../images/AWSFailoverExtensionHighLevel.gif
  :width: 800

Prerequisites
-------------
These are the minimum requirements for setting up Cloud Failover in AWS:

- 2 clustered BIG-IPs
   - Note: Here is an [example AWS CloudFormation template](https://github.com/F5Networks/f5-aws-cloudformation/tree/master/supported/failover/across-net/via-api/2nic/existing-stack/payg), although this is not required.  Any configuration tool can be used to provision the resources.
- An AWS IAM role with sufficient access
    - Using Standard roles
        - EC2 Full Access
        - S3 Full Access - Note: This should be limited to necessary buckets
- An S3 bucket for Cloud Failover extension cluster-wide file(s). This must be tagged with a key/value pair corresponding to the key/value(s) provided in the `externalStorage.scopingTags` section of the Cloud Failover extension configuration.
       .. IMPORTANT:: Ensure the required storage accounts do not have public access.
- Elastic IP addresses tagged with the following (optional):
    - Tagged with a key/value corresponding to the key/value(s) provided in the `failoverAddresses.scopingTags` section of the Cloud Failover extension configuration
    - Tagged with a special key called `VIPS` containing a comma seperated list of addresses mapping to a private IP address on each instance in the cluster that the Elastic IP is associated with. Example: `10.0.0.10,10.0.0.11`
- Route(s) in a route table tagged with the following (optional):
    - Tagged with a key/value corresponding to the key/value(s) provided in the `failoverRoutes.scopingTags` section of the Cloud Failover extension configuration
    - Tagged with a special key call `f5_self_ips` containing a comma seperated list of addresses mapping to a self IP address on each instance in the cluster that the routes should be pointed at. Example: `10.0.0.10,10.0.0.11`
    - Note: The failover extension configuration `failoverRoutes.scopingAddressRanges` should contain a list of destination routes to update



.. _aws-example:

Example Declaration
-------------------
This example declaration shows the minimum information needed to update the cloud resources in AWS.

.. code-block:: json

    {
        "class": "Cloud_Failover",
        "environment": "aws",
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

   <a href="https://github.com/F5Networks/f5-aws-cloudformation/tree/master/supported/failover/across-net/via-api/2nic/existing-stack/payg" target="_blank">GitHub</a>

.. |cloudformation| raw:: html

   <a href="https://github.com/F5Networks/f5-aws-cloudformation/tree/master/supported/failover/across-net/via-api/2nic/existing-stack/payg" target="_blank">example Cloudformation template</a>
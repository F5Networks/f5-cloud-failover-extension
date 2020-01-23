.. _aws:

AWS
===

In this section, you can see a failover event diagram, example declaration, requirements, and tasks for implementing Cloud Failover in AWS. 


Failover Event Diagram
----------------------

This diagram shows a failover event with CFE implemented in AWS. You can see Elastic IP addresses with matching tags are associated with the secondary private IP matching the virtual address corresponding to the active BIG-IP device. Route targets with destinations matching the Failover Extension configuration are updated with the network interface of the active BIG-IP device.

.. image:: ../images/aws/AWSFailoverExtensionHighLevel.gif
  :width: 800

|

.. _aws-example:

Example Declaration
-------------------
This example declaration shows the minimum information needed to update the cloud resources in AWS. See the :ref:`quickstart` section for steps on how to post this declaration.

.. literalinclude:: ../../examples/declarations/aws.json
   :language: json
   :tab-width: 4

:fonticon:`fa fa-download` :download:`aws.json <../../examples/declarations/aws.json>`

|

Requirements
------------
These are the minimum requirements for setting up Cloud Failover in AWS:

- **2 BIG-IP systems in Active/Standby configuration**. You can find an example AWS Cloudformation template |cloudformation|. Any configuration tool can be used to provision the resources.
- **An AWS Identity and Access Management (IAM) role with sufficient access**. See the instructions below for :ref:`aws-iam`.
- **Create an S3 bucket for Cloud Failover Extension cluster-wide file(s)**. Then add tags for a key/value pair that corresponds to the key/value(s) in the `externalStorage.scopingTags` section of the Cloud Failover Extension configuration. To read more about tagging AWS resources, see |awstagging|.

  .. IMPORTANT:: Ensure the required storage accounts do not have public access.

- **Route(s) in a route table** tagged with:
    - a key/value that corresponds to the key/value(s) in the `failoverRoutes.scopingTags` section of the Cloud Failover Extension configuration.
  
  .. NOTE:: The failover extension configuration `failoverRoutes.scopingAddressRanges` contains a list of destination routes to update.
  

- **If provisioning Same Network Topology, you will need to**:

  - Tag Network Interfaces with:

    - a key/value that corresponds to the key/value(s) in the `failoverAddresses.scopingTags` section of the Cloud Failover Extension configuration.
    - a special key called ``f5_cloud_failover_nic_map``. This key is a NIC mapping tag where the key is static but the value is user-provided and must match the corresponding NIC on the secondary BIG-IP. For example, ``f5_cloud_failover_nic_map:<your value>``.

  - Disable the built-in script (/usr/libexec/aws/aws-failover-tgactive.sh) from a BIG-IP shell, either manually or using automation:

    .. code-block:: bash

      mount -o remount,rw /usr
      mv /usr/libexec/aws/aws-failover-tgactive.sh /usr/libexec/aws/aws-failover-tgactive.sh.disabled
      mount -o remount,ro /us

- **If provisioning Across Network Topology, you will need to**:

  - Tag Elastic IP addresses with:

    - a key/value that corresponds to the key/value(s) in the `failoverAddresses.scopingTags` section of the Cloud Failover Extension configuration
    - a special key called ``VIPS`` that contains a comma-separated list of addresses mapping to a private IP address on each instance in the cluster that the Elastic IP is associated with. For example: ``10.0.0.10,10.0.0.11``

|

.. _aws-iam:

Creating and assigning an IAM Role
``````````````````````````````````
To create and assign an IAM role you must have a user role of `iam:CreateUser`.

#. In AWS, go to **IAM > Roles** and create a policy with the following permissions:

   - EC2 Read/Write
   - S3 Read/Write
   - STS Assume Role
   
   |
    
   For example, to create a role for an EC2 service follow these steps:
       1. In the navigation pane of the console, click :guilabel:`Roles` and then select :guilabel:`Create role`.
   
       2. Select the EC2 service that you will use for this role. Then click :guilabel:`Next: Permissions`.

       3. Click :guilabel:`Create policy` to open a new browser tab and then |createpolicy|.

       4. Select the EC2 service, expand :guilabel:`Write box` and select the :guilabel:`CreateRoute/ReplaceRoutes` boxes that you want the service to have.

       5. Specify the route-table resource ARN for the ReplaceRoute and CreateRoute action.

       6. Add a route table ARN with the following syntax: ``arn:aws:ec2:region:account:route-table/route-table-id``

       7. Optionally, add a Request Condition.
   
       8. Choose :guilabel:`Review policy` then select :guilabel:`Create policy`.

   .. image:: ../images/aws/AWSIAMRoleSummary.png
     :width: 800
    
   |

#. Assign an IAM role to each instance by navigating to **EC2 > Instances > Instance > Actions > Instance Settings > Attach/Replace IAM Role**

   For example:

   .. image:: ../images/aws/AWSIAMRoleAssignedToInstance.png
     :width: 800

|

IAM Role Example Declaration
````````````````````````````

Below is an example F5 policy that includes IAM roles.

.. IMPORTANT:: This example provides the minimum permissions required and serves as an illustration. You are responsible for following the provider's IAM best practices.

.. code-block:: json

    {
      "Version": "2012-10-17",
      "Statement": [
        {
          "Action": [
            "ec2:DescribeInstances",
            "ec2:DescribeInstanceStatus",
            "ec2:DescribeAddresses",
            "ec2:DescribeNetworkInterfaces",
            "ec2:DescribeNetworkInterfaceAttribute",
            "ec2:DescribeRouteTables",
            "s3:ListAllMyBuckets",
            "ec2:AssociateAddress",
            "ec2:DisassociateAddress",
            "ec2:AssignPrivateIpAddresses",
            "ec2:UnassignPrivateIpAddresses"
          ],
          "Resource": "*",
          "Effect": "Allow"
        },
        {
          "Action": [
            "sts:AssumeRole"
          ],
          "Resource": "arn:aws:iam:::role/<my_role>",
          "Effect": "Allow"
        },
        {
          "Action": [
            "ec2:CreateRoute",
            "ec2:ReplaceRoute"
          ],
          "Resource": "arn:aws:ec2:<my_region>:<account_id>:route-table/<my_id>",
          "Condition": {
            "StringEquals": {
              "ec2:ResourceTag/Name": "<my_resource_name>"
            }
          },
          "Effect": "Allow"
        },
        {
          "Action": [
            "s3:ListBucket",
            "s3:GetBucketTagging"
          ],
          "Resource": "arn:aws:s3:::<my_id>",
          "Effect": "Allow"
        },
        {
          "Action": [
            "s3:PutObject",
            "s3:GetObject",
            "s3:DeleteObject"
          ],
          "Resource": "arn:aws:s3:::<my_id>/*",
          "Effect": "Allow"
        }
      ]
    }

|


.. NOTE:: To provide feedback on this documentation, you can file a |issue|.



.. |github| raw:: html

   <a href="https://github.com/F5Networks/f5-aws-cloudformation/tree/master/supported/failover/across-net/via-api/2nic/existing-stack/payg" target="_blank">GitHub</a>

.. |cloudformation| raw:: html

   <a href="https://github.com/F5Networks/f5-aws-cloudformation/tree/master/supported/failover/across-net/via-api/2nic/existing-stack/payg" target="_blank">here</a>


.. |issue| raw:: html

   <a href="https://github.com/F5Devcentral/f5-cloud-failover-extension/issues" target="_blank">GitHub Issue</a>


.. |s3bucket| raw:: html

   <a href="https://docs.aws.amazon.com/AmazonS3/latest/user-guide/create-bucket.html" target="_blank">S3 bucket</a>


.. |createpolicy| raw:: html

   <a href="file:///C:/f5-cloud-failover/docs/_build/html/userguide/aws.html" target="_blank">create a new policy</a>


.. |awstagging| raw:: html

   <a href="https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/Using_Tags.html" target="_blank">AWS documentation</a>
   

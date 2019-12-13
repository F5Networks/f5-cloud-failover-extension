.. _example-declarations:

Example Declarations
====================

Azure Declaration and Response
------------------------------

.. code-block:: json

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


Response:

.. code-block:: json

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


.. _aws-iam:

AWS Declaration with IAM Roles
------------------------------

.. IMPORTANT:: This example provides the minimum permissions required and serves as an illustration. The customer is responsible for following the provider's IAM best practices.

.. code-block:: json

    resource "aws_iam_role_policy" "BigIpPolicy" {
     name = "BigIpPolicy"
     role = "${aws_iam_role.main.id}"

     policy = <<EOF
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
                "ec2:AssociateAddress",
                "ec2:DisassociateAddress",
                "ec2:assignprivateipaddresses",
                "ec2:unassignPrivateIpAddresses",
                "s3:ListAllMyBuckets"
            ],
            "Resource": [
                "*"
            ],
            "Effect": "Allow"
        },
        {
            "Action": [
                "sts:AssumeRole"
            ],
            "Resource": [
                "arn:aws:iam:::role/Failover-Extension-IAM-role-${module.utils.env_prefix}"
            ],
            "Effect": "Allow"
        },
        {   
            "Action": [
                "ec2:CreateRoute",
                "ec2:ReplaceRoute"
            ],
            "Resource": [
                "arn:aws:ec2:::route-table/*"
            ],
            "Condition": {
                "StringEquals": {
                    "ec2:Vpc": "arn:aws:ec2:::vpc/${aws_vpc.main.id}"
                }
            },
            "Effect": "Allow"
        },
        {
            "Action": [
                "s3:ListBucket",
                "s3:GetBucketTagging"
            ],
            "Resource": "arn:aws:s3:::${aws_s3_bucket.configdb.id}",
            "Effect": "Allow"
        },
        {
            "Action": [
                "s3:PutObject",
                "s3:GetObject",
                "s3:DeleteObject"
            ],
            "Resource": "arn:aws:s3:::${aws_s3_bucket.configdb.id}/*",
            "Effect": "Allow"
        }
    ]
    }
    EOF
    }

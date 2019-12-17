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



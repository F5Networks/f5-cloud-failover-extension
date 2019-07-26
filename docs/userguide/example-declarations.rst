.. _example-declarations:

Example Declarations
--------------------

.. code-block:: json

   {
        "class": "Cloud_Failover",
        "environment": "azure",
        "storageResource": "myuniquestorageaccount",
        "storageTags": [
            {
                "key": "value",
                "value": "myvalue"
            }
        ],
        "managedRoutes": [
            "192.168.1.0/24"
        ],
        "addressTags": [
            {
                "key": "F5_CLOUD_FAILOVER_LABEL",
                "value": "mydeployment"
            }
        ]
    }


Response:

.. code-block:: json

   {
        "message": "success",
        "declaration": {
            "class": "Cloud_Failover",
            "environment": "azure",
            "storageResource": "myuniquestorageaccount",
            "storageTags": [
                {
                    "key": "value",
                    "value": "myvalue"
                }
            ],
            "managedRoutes": [
                "192.168.1.0/24"
            ],
            "addressTags": [
                {
                    "key": "F5_CLOUD_FAILOVER_LABEL",
                    "value": "mydeployment"
                }
            ]
        }
    }

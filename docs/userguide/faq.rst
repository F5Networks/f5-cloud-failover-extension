.. _faq:

Frequently Asked Questions (FAQ)
--------------------------------


**What is Cloud Failover?**

Cloud Failover (CF) is an iControl LX Extension delivered as a TMOS-independent RPM file. Installing the CF Extension on BIG-IP provides L3 failover functionality in cloud environments. 

*Cloud Failover is:*

-  A javascript |ilx| plug-in
-  A |declare| interface for configuring Cloud Failover on BIG-IP
-  |atomic| (CF declarations)

*but it is NOT:*

-  created to include a graphical interface (GUI)


|


**Where can I download Cloud Failover?**

Cloud Failover is available on |github| in the |releases| section under *Assets*.


|


**When is Cloud Failover a good fit and when it is not?**

*Cloud Failover is a good fit where:*

- You are using an HA Pair in an Active/Standby configuration.
- You require a simple method to deploy and upgrade an HA solution without having to deploy a cloud native template. 


*Cloud Failover may not be a good fit where:*

- You are using more than one traffic group. For example, devices are in Active/Active or Active/Active/Standby configuration.


|


**Which TMOS versions does Cloud Failover support?**

Cloud Failover supports TMOS 14.1.x and later.

|

**Can I use this with Application Services Extension (AS3)?** 

Yes, Cloud Failover Extension can be used with |as3| declarations. AS3 leverages tenant partitions and some previous failover solutions did not support inspecting tenant partitions.

|


**Does it matter if I use Cloud Failover in same network or across network?**

Cloud Failover is agnostic to same-network and across-network topologies. However, see the next question for more information regarding AWS.


|


**Does Cloud Failover Extension support AWS Same-AZ failover?**

Cloud Failover Extension does not currently support AWS Same-AZ. Same AZ failover is still provided by the original functionality built-in to BIG-IP VE AWS image. See the |releases| section on GitHub to keep up to date with CF features and enhancements.


|


**Does Cloud Failover Extension support IPV6?**

Cloud Failover Extension does not currently support IPV6.


|

**What information does Cloud Failover Extension store?**

Cloud Failover Extension stores the BIG-IP failover IP address and routes in the cloud storage JSON file (example below). For this reason, make sure your cloud store does not have public access.

.. code-block:: json

    "taskState": "SUCCEEDED",
    "message": "Failover Completed Successfully",
    "timestamp": "2019-09-25T23:44:44.381Z",
    "instance": "failover0.local",
    "failoverOperations": {
    "routes": {},
    "addresses": {}
    }



|


**Does the Cloud Failover Extension collect telemetry data?**

We collect non-personal telemetry data to help improve the Cloud Failover Extension. An example of the payload that is sent is shown below. You can disable this feature by running the command ``tmsh modify sys software update auto-phonehome disabled``.

.. code-block:: json

    {
        "documentType": "f5-cloud-failover-data",
        "documentVersion": "1",
        "digitalAssetId": "xxxx",
        "digitalAssetName": "f5-cloud-failover",
        "digitalAssetVersion": "1.0.0",
        "observationStartTime": "xxxx",
        "observationEndTime": "xxxx",
        "epochTime": "123581321",
        "telemetryId": "xxxx",
        "telemetryRecords": [
            {
                "environment": "azure",
                "Failover": 1,
                "platform": "BIG-IP",
                "platformVersion": "14.1.0.5",
                "featureFlags": {
                    "ipFailover": true,
                    "routeFailover": false
                }
            }
        ]
    }



|

**How do I report issues, feature requests, and get help with Cloud Failover?**

You can use |issues| to submit feature requests or problems with Cloud Failover.

|



.. |ilx| raw:: html

   <a href="https://clouddocs.f5.com/products/iapp/iapp-lx/latest/" target="_blank">iControl LX</a>


.. |declare| raw:: html

   <a href="https://f5.com/about-us/blog/articles/in-container-land-declarative-configuration-is-king-27226" target="_blank">declarative</a>


.. |atomic| raw:: html

   <a href="https://www.techopedia.com/definition/3466/atomic-operation" target="_blank">Atomic</a>


.. |github| raw:: html

   <a href="https://github.com/F5Devcentral/f5-cloud-failover-extension" target="_blank">GitHub</a>


.. |issues| raw:: html

   <a href="https://github.com/F5Devcentral/f5-cloud-failover-extension/issues" target="_blank">GitHub Issues</a>


.. |as3| raw:: html

    <a href="https://clouddocs.f5.com/products/extensions/f5-appsvcs-extension/latest/" target="_blank">AS3</a>

.. |releases| raw:: html

   <a href="https://github.com/f5devcentral/f5-cloud-failover-extension/releases" target="_blank">Releases</a>
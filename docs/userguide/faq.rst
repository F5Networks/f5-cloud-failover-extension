.. _faq:

Frequently Asked Questions (FAQ)
--------------------------------


**What is Cloud Failover?**

Cloud Failover (CS) is an iControl LX Extension delivered as a TMOS-independent RPM file. Installing the CF Extension on BIG-IP provides L3 failover functionality in cloud environments. 

*Cloud Failover is:*

-  A javascript |ilx| plug-in
-  A |declare| interface for configuring telemetry on BIG-IP
-  |atomic| (CF declarations)

*BUT... it is:*

-  **not** created to include a graphical interface (GUI)

|

**Where can I download Cloud Failover?**

Cloud Failover is available on |github| and is F5-supported.

|


**When is Cloud Failover a good fit and when it is not?**

*Cloud Failover is a good fit where:*

- You require a simple method to upgrade the BIG-IP system without having to run the cloudlibs template

*Cloud Failover may not be a good fit where:*

- Declarative interface is not desirable

|


**Which TMOS versions does Cloud Failover support?**

Cloud Failover supports TMOS 14.1.x and later.

|


**What information does Cloud Failover extension store?**

Cloud Failover extension stores the BIG-IP failover IP address and routes in the cloud storage JSON file (example below). For this reason, make sure your cloud store does not have public access.

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


**Does it matter if I use Cloud Failover in same network or across network?**

Cloud Failover is agnostic to same network and across network topologies.

|

**How do I report issues, feature requests, and get help with Cloud Failover?**

- You can use |issues| to submit feature requests or problems with Cloud Failover.

|



.. |ilx| raw:: html

   <a href="https://clouddocs.f5.com/products/iapp/iapp-lx/latest/" target="_blank">iControl LX</a>


.. |declare| raw:: html

   <a href="https://f5.com/about-us/blog/articles/in-container-land-declarative-configuration-is-king-27226" target="_blank">declarative</a>


.. |atomic| raw:: html

   <a href="https://www.techopedia.com/definition/3466/atomic-operation" target="_blank">atomic</a>


.. |github| raw:: html

   <a href="https://github.com/F5Networks/f5-cloud-failover" target="_blank">GitHub</a>


.. |issues| raw:: html

   <a href="https://github.com/F5Networks/f5-cloud-failover/issues" target="_blank">GitHub Issues</a>



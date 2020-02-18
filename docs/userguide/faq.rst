.. _faq:

Frequently Asked Questions (FAQ)
================================

Index
-----

- :ref:`faq-what-is`
- :ref:`faq-when-is`
- :ref:`faq-where-download`
- :ref:`faq-which-version`
- :ref:`faq-support-ipv6`
- :ref:`faq-track-features`
- :ref:`faq-as3`
- :ref:`faq-same-network`
- :ref:`faq-same-az`
- :ref:`faq-tag`
- :ref:`faq-existing-cluster`
- :ref:`faq-info-store`
- :ref:`faq-telemetry`
- :ref:`faq-routetag`
- :ref:`faq-report`


-----------------------------------------

.. _faq-what-is:

What is Cloud Failover Extension?
`````````````````````````````````

Cloud Failover (CFE) is an iControl LX Extension delivered as a TMOS-independent RPM file. Installing CFE on BIG-IP provides L3 failover functionality in cloud environments. 

*Cloud Failover Extension is:*

-  A javascript |ilx| plug-in
-  A |declare| interface for configuring Cloud Failover on BIG-IP

*but it is NOT:*

-  created to include a graphical interface (GUI)


-----------------------------------------

.. _faq-when-is:

When is CFE a good fit and when it is not?
``````````````````````````````````````````

*Cloud Failover is a good fit where:*

- You are using an HA Pair in an Active/Standby configuration.
- You require a simple method to deploy and upgrade an HA solution without having to deploy a cloud native template. 


*Cloud Failover may not be a good fit where:*

- You are using more than one traffic group. For example, devices are in Active/Active or Active/Active/Standby configuration.


-----------------------------------------

.. _faq-where-download:

Where can I download CFE?
`````````````````````````

Cloud Failover Extension is available on |github| in the |releases| section under *Assets*.


-----------------------------------------

.. _faq-which-version:

Which TMOS versions does CFE support?
`````````````````````````````````````

Cloud Failover Extension supports TMOS 14.1.x and later.


-----------------------------------------

.. _faq-support-ipv6:

Does CFE support IPv6?
``````````````````````

- IPv6 route failover is currently supported for AWS only. To see an example confguration for AWS that enables IPv6 route failover, see :ref:`example-declarations`. 
- IPv6 IP address failover (for addresses in traffic-groups like VIPS, SNATS, and NATs) is not yet supported for any clouds.


-----------------------------------------

.. _faq-track-features:

How can I track new CFE features?
`````````````````````````````````

See the |releases| section on GitHub to keep up to date with CFE features and enhancements. You can also track changes to this documentation in the :ref:`revision-history`.


-----------------------------------------

.. _faq-as3:

Can I use CFE with Application Services Extension (AS3)?
````````````````````````````````````````````````````````

Yes, Cloud Failover Extension can be used with |as3| declarations. AS3 leverages tenant partitions and some previous failover solutions did not support inspecting tenant partitions.

-----------------------------------------

.. _faq-same-network:

Does it matter if I use CFE in same network or across network?
``````````````````````````````````````````````````````````````

Cloud Failover Extension is agnostic to same-network and across-network topologies.


-----------------------------------------

.. _faq-same-az:

Does CFE support AWS Same-AZ failover?
``````````````````````````````````````

Yes, Cloud Failover Extension supports AWS Same-AZ failover. See the :ref:`aws` section for more details.

-----------------------------------------

.. _faq-tag:

Do I always have to tag my resources?
`````````````````````````````````````

Yes. Even when you only have routes to update during failover (for example, there are no Elastic IPs to re-map) you still have to tag the NICs on the VMs associated with the IPs in your CFE configuration.


-----------------------------------------

.. _faq-existing-cluster:

How does CFE work on an existing BIG-IP cluster using legacy failover scripts installed by Cloud Templates?
```````````````````````````````````````````````````````````````````````````````````````````````````````````

CFE disables the existing failover scripts installed by the Cloud Templates transparently to the user.



-----------------------------------------


.. _faq-info-store:

What information does CFE store?
````````````````````````````````

Cloud Failover Extension stores the BIG-IP failover IP address and routes in the cloud storage JSON file (example below). For this reason, make sure your cloud store does not have public access.

.. code-block:: json

    {
        "taskState": "SUCCEEDED",
        "message": "Failover Completed Successfully",
        "timestamp": "2019-09-25T23:44:44.381Z",
        "instance": "failover0.local",
        "failoverOperations": {
            "routes": {},
            "addresses": {}
        }
    }


-----------------------------------------

.. _faq-telemetry:

Does CFE collect telemetry data?
````````````````````````````````

F5 collects non-personal telemetry data to help improve the Cloud Failover Extension. You can see an example of the payload that is sent below. To disable this feature, run the command ``tmsh modify sys software update auto-phonehome disabled``.

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


-----------------------------------------

.. _faq-routetag:

Why does CFE no longer default to a tag on the route for next hop address discovery?
````````````````````````````````````````````````````````````````````````````````````

Specifying the `f5_self_ips` tag on the route object itself creates a circular dependency in some scenarios, especially when using declarative configuration tools like Terraform. For backwards compatability this option is still available, however, F5 recommends alternate approaches, such as providing the next hop addresses (a self IP for each BIG-IP in the cluster) in the Cloud Failover Extension configuration payload. See :ref:`example-declarations` for an example using the original route tag discovery method.


-----------------------------------------

.. _faq-persistent-config:

Does CFE configuration persist after a reboot?
````````````````````````````````````````````````````````````````````````````````````

Yes, when configuration is provided using the CFE `declare` API endpoint it will be saved to the persistent BIG-IP configuration store which is loaded on reboot.


-----------------------------------------

.. _faq-report:

How do I report issues, feature requests, and get help with CFE?
````````````````````````````````````````````````````````````````

You can use |issues| to submit feature requests or problems with Cloud Failover Extension, including documentation issues.




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
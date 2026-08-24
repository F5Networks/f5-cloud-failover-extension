.. _faq:

Frequently Asked Questions (FAQ)
================================

Index
-----

- :ref:`faq-what-is`
- :ref:`faq-when-is`
- :ref:`faq-active-active`
- :ref:`faq-route-domains`
- :ref:`faq-cfe-caveats`
- :ref:`faq-where-download`
- :ref:`faq-which-version`
- :ref:`faq-support-ipv6`
- :ref:`faq-track-features`
- :ref:`faq-as3`
- :ref:`faq-same-network`
- :ref:`faq-snat`
- :ref:`faq-tg-none`
- :ref:`faq-components`
- :ref:`faq-routes-updated`
- :ref:`faq-default-route`
- :ref:`faq-same-az`
- :ref:`faq-multi-az-gcp`
- :ref:`faq-azure-vnet-separate-resource-group`
- :ref:`faq-azure-api`
- :ref:`faq-azure-static-allocation`
- :ref:`faq-tag`
- :ref:`faq-existing-cluster`
- :ref:`faq-info-store`
- :ref:`faq-telemetry`
- :ref:`faq-auto-phone-home`
- :ref:`faq-imds-v2`
- :ref:`faq-routetag`
- :ref:`faq-persistent-config`
- :ref:`faq-troubleshoot`
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

.. _faq-active-active:

Is Active/Active supported?
```````````````````````````
Active/Active or ScaleN (multiple traffic groups) is not supported at this time. CFE is currently not multiple-traffic-group-aware. ScaleN is a powerful feature to increase service density (each instance owns a particular set of IP addresses known as traffic groups) but can add more complexity in determining which instance should handle traffic at any given time. It also makes troubleshooting more difficult. The global instance level Active/Standby status (provided at the CLI prompt or GUI) is leveraged to provide an easy visual queue for which instance the NATs and/or routes should be pointing.

.. Note:: VIPs can be placed in ``traffic-group-none`` so `each` instance can actively process traffic regardless of the Active/Standby status. This is done to reduce service interruption during cloud resource re-mapping. However, on the cloud side, NATs/routes are only mapped to the single Active instance.


-----------------------------------------

.. _faq-route-domains:

Are non-default route domains supported?
```````````````````````````
Using failover addresses configured with non-default route domains is not supported at this time. CFE currently does not fail over IP addresses configured with non-default route domains. 

.. Note:: Failover addresses can be configured with the default route domain 0.


-----------------------------------------

.. _faq-cfe-caveats:

What are some of the caveats of failover in Cloud environments?
```````````````````````````````````````````````````````````````
.. seealso::
   :class: sidebar

   - `Overview of connection and persistence mirroring (11.x - 12.x) <https://support.f5.com/csp/article/K13478>`_
   - `BIG-IP ASM-enabled virtual servers do not support connection mirroring <https://support.f5.com/csp/article/K8637>`_


- Traditional connection or session mirroring does not work in SDN based clouds because:

  - In Same AZ, IP failover via API takes longer than typical TCP connection timers allow.
  - In Across AZ, IPs cannot float.

- The persistence strategies are limited to `stateless` strategies like HTTP Cookie/CARP. You do not need to mirror TCP connections with HTTP because the HTTP protocol allows individual connections to fail without losing the entire session. In a failover scenario, connections are dropped but the clients can re-initiate connections to the same IP on the new instance without needing a DNS update.

|


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
- IPv6 route failover is currently supported for AWS and Azure only. To see an example configuration for AWS that enables IPv6 route failover, see :ref:`example-declarations`.
- IPv6 IP address failover (for addresses in traffic-groups like VIPS, SNATS, and NATs) is not yet supported for any clouds.
- Limitations:

  - All BIG-IP NICs (including Management) must be dual IPV6 + IPV4 stack.
  - See your cloud provider for additional limitations. For example:

    - https://docs.microsoft.com/en-us/azure/virtual-network/ipv6-overview#limitations
    - https://docs.microsoft.com/en-us/azure/virtual-network/virtual-network-network-interface-addresses#ipv6
    - https://cloud.google.com/compute/docs/ip-addresses/reserve-static-internal-ip-address


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

.. seealso::
   :class: sidebar

   `Deploying BIG-IP High Availability Across AWS Availability Zones <https://www.f5.com/pdf/deployment-guides/f5-aws-ha-dg.pdf>`_.

Cloud Failover Extension is agnostic to same-network and across-network topologies.

CFE will work across Availability Zones by remapping elastic public IPs to those internal IPs that remain on each BIG-IP in different Availability Zones. In Same Availability Zones, CFE will move the internal IPs from one BIG-IP system to another.



-----------------------------------------

.. _faq-snat:

Is SNAT required?
`````````````````
SNAT is not required if your application server’s default route points through the BIG-IPs NICs. If you are using SNAT in AWS HA Across AZ, please see :ref:`aws-define-addresses-acrossnet`.

Because subnets/address space are different in each Availability Zone, you cannot use floating IP addresses. The only traffic-group (which typically contains floating addresses) that should exist is the default traffic-group-1. The presence of this traffic-group determines which BIG-IP is active.

.. Note:: If BIG-IP systems are used to manage outbound traffic, the only address traffic-group-1 might have is a wildcard (0.0.0.0) address used for a forwarding virtual server.

The lack of floating addresses has implications on the BIG-IP system’s SNAT (Source Network Address Translation) functionality. If using SNAT on the virtual servers (for example, the BIG-IP systems are not the default gateway/route for your application servers), SNAT Auto Map is the only supported SNAT method. SNAT Auto Map uses the unique Self IP of each BIG-IP system for the source address instead of the traditional floating Self IP. If `NOT` using SNAT, you need the BIG-IP systems to be the default gateway/route for your applications. In this case, you need to configure Route Management. For more information about SNAT Auto Map, see `this article <https://support.f5.com/kb/en-us/solutions/public/7000/300/sol7336.html>`_.


------------------------------------------

.. _faq-tg-none:

Why does the AWS failover diagram show that VIPs must be in traffic group 'none'?
`````````````````````````````````````````````````````````````````````````````````
Beginning with CFE version 1.9.0., Virtual Addresses or services are no longer required to be in Traffic Group None and can be placed in Traffic Group 1.


------------------------------------------

.. _faq-components:

What does discoveryType = "static" mean? What is scopingAddressRange?
`````````````````````````````````````````````````````````````````````
In the case where BIG-IP has multiple Self IPs/NICs, CFE needs to know what Self-IP(s) or NICs to re-map the routes to. You can either define the exact Self-IPs you want to point them at in tags on the route table and have the CFE discover those tags with Self-IPs, or you can configure them statically in the CFE configuration itself. NOTE: In the static config method, you will still need the Tags to know which route table to manaage, you just don't need the additional tags with Self-IP mappings.

See more information in the :ref:`declaration-components` section.


------------------------------------------

.. _faq-routes-updated:

What route(s) are to be updated? The BIG-IPs can be in different subnets.
`````````````````````````````````````````````````````````````````````````
The routes can be in any route table to which you attach a matching tag from your CFE configuration. In HA Across AZ, the route tables are remote (for example, in an application subnet versus directly connected subnet to BIG-IP).


------------------------------------------

.. _faq-default-route:

Must the web servers' default route be pointed at the BIG-IPs internal interface?
`````````````````````````````````````````````````````````````````````````````````
This depends on the solution:

- For Same AZ clusters, if you point Webservers default gateway at BIG-IP, you do not have to SNAT.
- For HA-Across-AZ clusters, you have to SNAT incoming traffic anyway so you do not need to point the default route to BIG-IP. You would only do it for outbound traffic (if you want to direct traffic initiated by webserver to go through the BIG-IP system)


-----------------------------------------

.. _faq-same-az:

Does CFE support AWS Same-AZ failover?
``````````````````````````````````````
Yes, Cloud Failover Extension supports AWS Same-AZ failover. See the :ref:`aws` section for more details.


-----------------------------------------

.. _faq-multi-az-gcp:

Does CFE support GCP instances in separate Availability Zones?
``````````````````````````````````````````````````````````````
Yes, Cloud Failover Extension supports instances being placed in separate availability zones within a given region.


-----------------------------------------

.. _faq-azure-vnet-separate-resource-group:

Can the BIG-IP instances be deployed in a different resource group than the virtual network?
````````````````````````````````````````````````````````````````````````````````````````````
Yes, the BIG-IP instances and related instance objects, such as network interfaces, need to be deployed in the same resource group. However, the virtual network can be deployed in any resource group as long as the appropriate permissions are put in place.


-----------------------------------------

.. _faq-azure-api:

Does CFE eliminate the delay time observed with previous failover templates when calling the Azure APIs?
````````````````````````````````````````````````````````````````````````````````````````````````````````
To failover cloud resource objects such as private IP addresses and route tables, CFE does make calls to the Azure APIs. These calls may vary significantly in response time.

-----------------------------------------

.. _faq-azure-static-allocation:

Why do my Azure IP configuration private/public mappings change on failover?
`````````````````````````````````````````````````````````````````````````````
IP configurations may reassociate with the NIC in a different order, but all private/public mappings should remain the same. If the mappings are changing, ensure each IP configuration is configured using Static allocation. Dynamic allocation is sometimes leveraged for initial deployments but is discouraged for production deployments.

-----------------------------------------

.. _faq-tag:

Do I always have to tag my resources?
`````````````````````````````````````

Beginning with version v1.7.0, there are two options for configuring CFE. With the explicit configuration option, tagging external resources is no longer required. However, tagging BIG-IPs own NICs own cloud resources may still be required. See :ref:`declaration-components` and your cloud providers specific configuration sections for more details.


-----------------------------------------

.. _faq-existing-cluster:

How does CFE work on an existing BIG-IP cluster using legacy failover scripts installed by Cloud Templates?
```````````````````````````````````````````````````````````````````````````````````````````````````````````
As of CFE version 1.1, CFE disables the existing failover scripts installed by the Cloud Templates transparently to the user. If you are using an older version of CFE and would like to have legacy scripts automatically disabled, you should :ref:`update-cfe`. Otherwise you will have to manually comment out the older failover scripts that the template installs:

- In ``/config/failover/tgactive`` and ``/config/failover/tgrefresh`` comment out the failover.js script with ``/config/cloud/cloud-libs/XXXXXX/failover.js``.
- After you POST the declaration, CFE will write out a new line that looks like this: ``curl -u admin:admin -d {} -X POST http://localhost:8100/mgmt/shared/cloud-failover/trigger``.



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
      "digitalAssetId": "xxxxx-xxxx-xxxx-xxxx-xxxxx",
      "digitalAssetName": "f5-cloud-failover",
      "digitalAssetVersion": "1.9.0",
      "observationStartTime": "2021-11-29T20:52:08.833Z",
      "observationEndTime": "2021-11-29T20:52:08.833Z",
      "epochTime": 1638219128833,
      "telemetryId": "xxxxx-xxxx-xxxx-xxxx-xxxxx",
      "telemetryRecords": [
        {
          "regkey": "xxxxx-xxxx-xxxx-xxxx-xxxxx",
          "customerId": "xxxxx-xxxx-xxxx-xxxx-xxxxx",
          "failover": {
            "event": true,
            "success": true,
            "totalRoutes": 4,
            "totalIps": 1,
            "startTime": "2021-11-29T20:50:27.786Z",
            "endTime": "2021-11-29T20:52:05.953Z"
          },
          "product": {
            "version": "1.9.0",
            "locale": "en-US",
            "installDate": "2021-11-29T20:52:05.953Z",
            "installationId": "",
            "environment": "azure",
            "region": "westus"
          },
          "featureFlags": {
            "ipFailover": true,
            "routeFailover": true
          },
          "operation": {
            "clientRequestId": "xxxxx-xxxx-xxxx-xxxx-xxxxx",
            "action": "POST",
            "endpoint": "trigger",
            "userAgent": "f5-cloud-failover/1.9.0",
            "result": "SUCCEEDED",
            "resultSummary": "Failover Successful"
          },
          "platform": "BIG-IP",
          "platformVersion": "14.1.4",
          "nicConfiguration": "multi",
          "cloudAccountId": "xxxxx-xxxx-xxxx-xxxx-xxxxx"
        }
      ]
    }


-----------------------------------------

.. _faq-auto-phone-home:

How do I disable Automatic Phone Home?
``````````````````````````````````````

- For more information on how to disable Automatic Phone Home, see this `Overview of the Automatic Update Check and Automatic Phone Home features <https://support.f5.com/csp/article/K15000#1>`_.
- If you are using Declarative Onboarding (DO), you can `disable the autoPhonehome property <https://clouddocs.f5.com/products/extensions/f5-declarative-onboarding/latest/schema-reference.html#system>`_.

-----------------------------------------

.. _faq-imds-v2:

Does CFE support accessing AWS Instance Metadata Service using session-oriented method (aka IMDSv2)?
````````````````````````````````````````````````````````````````````````````````````````````````````

- For more information on AWS IMDSv2, see this `Use IMDSv2 <https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/configuring-instance-metadata-service.html>`_.
- CFE always uses a session oriented-method for accessing AWS Instance Metadata Service since this method is always enabled on EC2 instances.

-----------------------------------------

.. _faq-routetag:

Why does CFE no longer default to a tag on the route for next hop address discovery?
````````````````````````````````````````````````````````````````````````````````````
Specifying the `f5_self_ips` tag on the route object itself creates a circular dependency in some scenarios, especially when using declarative configuration tools like Terraform. For backwards compatability this option is still available, however, F5 recommends alternate approaches, such as providing the next hop addresses (a self IP for each BIG-IP in the cluster) in the Cloud Failover Extension configuration payload. See :ref:`example-declarations` for an example using the original route tag discovery method.


-----------------------------------------

.. _faq-persistent-config:

Does CFE configuration persist after a reboot?
``````````````````````````````````````````````
Yes, when configuration is provided using the CFE `declare` API endpoint it will be saved to the persistent BIG-IP configuration store which is loaded on reboot.

-----------------------------------------

.. _faq-troubleshoot:

How do I troubleshoot CFE?
``````````````````````````
You can troubleshoot CFE by examining the restnoded failure log at ``/var/log/restnoded/restnoded.log``. For more information see the :ref:`troubleshooting` section.


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

   <a href="https://github.com/F5Networks/f5-cloud-failover-extension" target="_blank">GitHub</a>


.. |issues| raw:: html

   <a href="https://github.com/F5Networks/f5-cloud-failover-extension/issues" target="_blank">GitHub Issues</a>


.. |as3| raw:: html

    <a href="https://clouddocs.f5.com/products/extensions/f5-appsvcs-extension/latest/" target="_blank">AS3</a>

.. |releases| raw:: html

   <a href="https://github.com/F5Networks/f5-cloud-failover-extension/releases" target="_blank">Releases</a>
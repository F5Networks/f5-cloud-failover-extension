.. _performance-sizing:

Performance and Sizing
======================

This section shows how the configuration size of the cloud environment may affect CFE performance. These results are examples and may vary.


AWS
---

.. table:: CFE performance with AWS

   ================================ ==================== ==============================================================
   Number of Failover IP addresses  Number of Routes     Time to Successfully Failover All Objects
   ================================ ==================== ==============================================================
   None                             50 routes            5 seconds
   -------------------------------- -------------------- --------------------------------------------------------------
   None                             100 routes           5 seconds
   -------------------------------- -------------------- --------------------------------------------------------------
   None                             200 routes           15 seconds   *API rate throttling observed*
   -------------------------------- -------------------- --------------------------------------------------------------
   None                             500 routes           90 seconds
   -------------------------------- -------------------- --------------------------------------------------------------
   25 addresses                     None                 5 seconds
   -------------------------------- -------------------- --------------------------------------------------------------
   25 addresses                     25 routes            5 seconds
   -------------------------------- -------------------- --------------------------------------------------------------
   25 addresses                     50 routes            5 seconds
   -------------------------------- -------------------- --------------------------------------------------------------
   25 addresses                     100 routes           5 seconds
   ================================ ==================== ==============================================================


GCP
-----

.. table:: CFE performance with GCP

   ================================ ==================== ==============================================================
   Number of Failover IP addresses  Number of Routes     Time to Successfully Failover All Objects
   ================================ ==================== ==============================================================
   None                             50 routes            35 seconds
   -------------------------------- -------------------- --------------------------------------------------------------
   None                             100 routes           80 seconds   *API rate throttling observed*
   -------------------------------- -------------------- --------------------------------------------------------------
   None                             200 routes           90 seconds 
   -------------------------------- -------------------- --------------------------------------------------------------
   10 addresses                     None                 30 seconds
   -------------------------------- -------------------- --------------------------------------------------------------
   10 addresses                     25 routes            30 seconds
   -------------------------------- -------------------- --------------------------------------------------------------
   10 addresses                     50 routes            35 seconds
   -------------------------------- -------------------- --------------------------------------------------------------
   10 addresses                     100 routes           80 seconds   *API rate throttling observed*
   ================================ ==================== ==============================================================


Azure
-----

.. table:: CFE performance with Azure (without Azure FastPath enabled)

   ================================ ==================== ==============================================================
   Number of Failover IP addresses  Number of Routes     Time to Successfully Failover All Objects
   ================================ ==================== ==============================================================
   None                             50 routes            40 seconds
   -------------------------------- -------------------- --------------------------------------------------------------
   None                             100 routes           60 seconds
   -------------------------------- -------------------- --------------------------------------------------------------
   None                             200 routes           50 seconds
   -------------------------------- -------------------- --------------------------------------------------------------
   25 addresses                     None                 60 seconds
   -------------------------------- -------------------- --------------------------------------------------------------
   25 addresses                     25 routes            55 seconds
   -------------------------------- -------------------- --------------------------------------------------------------
   25 addresses                     50 routes            85 seconds
   -------------------------------- -------------------- --------------------------------------------------------------
   25 addresses                     100 routes           60 seconds
   ================================ ==================== ==============================================================

.. table:: CFE performance with Azure (with Azure FastPath enabled)

   ================================ ==================== ==============================================================
   Number of Failover IP addresses  Number of Routes     Time to Successfully Failover All Objects
   ================================ ==================== ==============================================================
   None                             50 routes            6 seconds
   -------------------------------- -------------------- --------------------------------------------------------------
   None                             100 routes           7 seconds
   -------------------------------- -------------------- --------------------------------------------------------------
   None                             200 routes           7 seconds
   -------------------------------- -------------------- --------------------------------------------------------------
   25 addresses                     None                 7 seconds
   -------------------------------- -------------------- --------------------------------------------------------------
   25 addresses                     25 routes            6 seconds
   -------------------------------- -------------------- --------------------------------------------------------------
   25 addresses                     50 routes            7 seconds
   -------------------------------- -------------------- --------------------------------------------------------------
   25 addresses                     100 routes           7 seconds
   ================================ ==================== ==============================================================


|

------------------------------------------

|


*TESTING NOTES:* 

- Failover times listed in the **CFE performance with Azure (without Azure Fast Path enabled)** table indicate when the Azure network resource provisioning state is "Succeeded", and do not reflect the time required for updates to propagate through the legacy Azure control plane. **Resources created with Azure Fast Path enabled are able to pass traffic through the BIG-IP instance(s) almost immediately after the update operation completes.**
- **API rate throttling observed**. At these levels, we observed the provider rate limiting requests. CFE implements clientside retries in these cases.
- Max objects tested were dictated by our default account quotas or limits. Quotas and limits can potentially be increased. See your provider for more details:

  - `AWS <https://docs.aws.amazon.com/general/latest/gr/aws_service_limits.html>`_
  - `GCP <https://cloud.google.com/docs/quota>`_
  - `Azure <https://docs.microsoft.com/en-us/azure/azure-resource-manager/management/azure-subscription-service-limits>`_


.. include:: /_static/reuse/feedback.rst
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

.. table:: CFE performance with Azure

   ================================ ==================== ==============================================================
   Number of Failover IP addresses  Number of Routes     Time to Successfully Failover All Objects
   ================================ ==================== ==============================================================
   None                             50 routes            95 seconds
   -------------------------------- -------------------- --------------------------------------------------------------
   None                             100 routes           155 seconds
   -------------------------------- -------------------- --------------------------------------------------------------
   None                             200 routes           175 seconds   *API rate throttling observed*
   -------------------------------- -------------------- --------------------------------------------------------------
   25 addresses                     None                 65 seconds
   -------------------------------- -------------------- --------------------------------------------------------------
   25 addresses                     25 routes            125 seconds
   -------------------------------- -------------------- --------------------------------------------------------------
   25 addresses                     50 routes            125 seconds
   -------------------------------- -------------------- --------------------------------------------------------------
   25 addresses                     100 routes           155 seconds
   ================================ ==================== ==============================================================

.. Note:: You can produce faster results with other methods that use upstream load balancers. Please consult the following `Microsoft documentation <https://docs.microsoft.com/en-us/azure/load-balancer/tutorial-load-balancer-ip-backend-portal>`_.

|

------------------------------------------

|


*TESTING NOTES:* 

- **API rate throttling observed**. At these levels, we observed the provider rate limiting requests. CFE implements clientside retries in these cases.
- Max objects tested were dictated by our default account quotas or limits. Quotas and limits can potentially be increased. See your provider for more details:

  - `AWS <https://docs.aws.amazon.com/general/latest/gr/aws_service_limits.html>`_
  - `GCP <https://cloud.google.com/docs/quota>`_
  - `Azure <https://docs.microsoft.com/en-us/azure/azure-resource-manager/management/azure-subscription-service-limits>`_


.. include:: /_static/reuse/feedback.rst
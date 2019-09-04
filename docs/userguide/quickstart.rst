.. _quickstart:

Quickstart 
==========

If you are familiar with the BIG-IP system, and generally familiar with REST and
using APIs, this section contains the minimum amount of information to get you
up and running with Cloud Failover.

.. sidebar:: :fonticon:`fa fa-info-circle fa-lg` Version Notice:

   In BIG-IP versions prior to 14.0.0, the Package Management LX tab will not show up in the user interface unless you run the following command from the BIG-IP CLI: ``touch /var/config/rest/iapps/enable``.

#. Download the latest RPM package from |github| in the **dist** directory.
#. Upload and install the RPM package on the using the BIG-IP GUI:

   - :guilabel:`Main tab > iApps > Package Management LX > Import`
   - Select the downloaded file and click :guilabel:`Upload`
   - For complete instructions see :ref:`installgui-ref` or
     :ref:`installcurl-ref`.

#. Be sure to see the known issues on GitHub (https://github.com/F5Networks/f5-cloud-failover/issues) to review any known issues and other important information before you attempt to use Cloud Failover.

#. Provide authorization (basic auth) to the BIG-IP system:  

   - If using a RESTful API client like Postman, in the :guilabel:`Authorization` tab, type the user name and password for a BIG-IP user account with Administrator permissions.
   - If using cURL, see :ref:`installcurl-ref`.

#. Using a RESTful API client like Postman, send a GET request to the URI
   ``https://{{host}}/mgmt/shared/cloud-failover/info`` to ensure Cloud Failover is running
   properly.

#. Copy one of the :ref:`example-declarations` which best matches the configuration you want
   to use.

#. Paste the declaration into your API client, and modify names and IP addresses
   as applicable.

#. POST to the URI ``https://<BIG-IP>/mgmt/shared/cloud-failover/declare``

Quick Start Example
-------------------

Here is an example declaration for Microsoft Azure.

.. code-block:: json
    :linenos:


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


 
.. |github| raw:: html

   <a href="https://github.com/F5Networks/f5-cloud-failover" target="_blank">F5 Cloud Failover site on GitHub</a>

    


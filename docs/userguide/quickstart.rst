.. _quickstart:

Quickstart 
==========

If you are familiar with the BIG-IP system, and generally familiar with REST and
using APIs, this section contains the minimum amount of information to get you
up and running with Cloud Failover.

.. sidebar:: :fonticon:`fa fa-info-circle fa-lg` Version Notice:

   Cloud Failover Extension supports BIG-IP version 14.1.X and later.


1. Download the latest RPM package from |github|.

2. Upload and install the RPM package using the BIG-IP GUI:

   - :guilabel:`Main tab > iApps > Package Management LX > Import`

   .. image:: ../images/cloud-failover-import.png
     :width: 800 

   - Select the downloaded file and click :guilabel:`Upload`
   - For complete instructions see :ref:`installgui-ref` or :ref:`installcurl-ref`

3. When using the BIG-IP API, F5 recommends increasing the memory allocated to the process called **restjavad**. Note that this process will cause service interruption. Add additional memory for restjavad using the following procedure:

   - In the BIG-IP user interface, navigate to **System > Resource Provisioning**. Set Management provisioning to **Large**. 
   - Modify sys db variables using following commands in the CLI (bash):

     ``tmsh modify sys db provision.extramb value 1000``

     ``tmsh modify sys db restjavad.useextramb value true``
  
   - Restart restjavad daemons:

     ``bigstart restart restjavad restnoded``    

4. Be sure to see the |known-issues| to review any known issues and other important information before you attempt to use Cloud Failover Extension.

5. Provide authorization (basic auth) to the BIG-IP system:  

   - If using a RESTful API client like Postman, in the :guilabel:`Authorization` tab, type the user name and password for a BIG-IP user account with Administrator permissions.
   - If using cURL, see :ref:`installcurl-ref`.

6. Using a RESTful API client, send a GET request to the URI ``https://{{host}}/mgmt/shared/cloud-failover/info`` to ensure Cloud Failover Extension is installed and running. For illustration purposes, the examples below use `curl` on the BIG-IP itself and the utililty `jq` to pretty print the JSON output:


   .. code-block:: shell

      [admin@bigip-A:Active:In Sync] config # curl -su admin: -X GET http://localhost:8100/mgmt/shared/cloud-failover/info | jq .
      {
         "version": "1.2.3",
         "release": "0",
         "schemaCurrent": "1.2.3",
         "schemaMinimum": "1.2.3"
      }


7. Copy one of the example declarations that best matches the configuration you want to use. There are additional examples in the individual provider sections for :ref:`aws`, :ref:`gcp`, and :ref:`azure` as well as the :ref:`example-declarations` section.

8. Paste or copy the declaration into your API client, and modify any names, addresses, routes or properties as applicable. 

   .. Note:: If configuration requires tags, the key and value pair in the configuration can be arbitrary but they must match the tags or labels that you assign to the infrastructure within the cloud provider. You can craft your declaration with any key and value pair as long as it matches what is in the configuration. For example:


   .. code-block:: json
   
      "failoverAddresses": {
         "scopingTags": {
            "i_am_an_arbitrary_key": "i_am_an_arbitrary_value"
         }



9. POST to the URI ``https://<BIG-IP>/mgmt/shared/cloud-failover/declare``.

   Below is an example where cfe.json is the file that has been uploaded or edited locally to contain the contents of your CFE declaration. 

   .. code-block:: shell

      [admin@bigip-A:Active:In Sync] config # vim cfe.json 
      [admin@bigip-A:Active:In Sync] config # curl -su admin: -X POST -d @cfe.json http://localhost:8100/mgmt/shared/cloud-failover/declare | jq .
      [admin@bigip-B:Standby:In Sync] config # curl -su admin: -X POST -d @cfe.json http://localhost:8100/mgmt/shared/cloud-failover/declare | jq .

   |

   If the declaration is successful, you will receive a response  that looks like this example:

   .. code-block:: json
   
        {
            "message": "success",
            "declaration": "..."
        }

   |

   .. IMPORTANT:: You must POST the initial configuration to each device at least once for the appropriate system hook configuration to enable failover via CFE. After that, additional configuration operations can be sent to a single device.
   
         
10. Validate.
      
- See the :ref:`config-validation` section. 
- Review the logs: ``tail –f /var/log/restnoded/restnoded.log``.

|

Quick Start Example
-------------------

Here is a simple example declaration for AWS. NOTE: This example declaration requires CFE v1.5.0 and above.

.. literalinclude:: ../../examples/declarations/quickstart.json
   :language: json
   :caption: Quick Start Example: AWS Single Routing Table
   :tab-width: 4
   :linenos:

:fonticon:`fa fa-download` :download:`quickstart.json <../../examples/declarations/quickstart.json>`


|


.. include:: /_static/reuse/feedback.rst


.. |github| raw:: html

   <a href="https://github.com/F5Networks/f5-cloud-failover-extension/releases" target="_blank">F5 Cloud Failover Extension site on GitHub</a>

   
.. |known-issues| raw:: html

   <a href="https://github.com/F5Networks/f5-cloud-failover-extension/issues" target="_blank">Known Issues on GitHub</a>



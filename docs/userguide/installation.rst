.. _installation:

Downloading and installing Cloud Failover
=========================================

The Cloud Failover package is an RPM file you download, and then upload to the BIG-IP system using the iControl/iApp LX framework. Alternatively, you can see our :doc:`quickstart`.


Downloading the RPM file
------------------------
The first task is to download the latest RPM file.  Go to the |github|, and download the latest (highest numbered) RPM file.

.. NOTE:: During beta release the RPM is available on |artifactory|.


Verifying the integrity of the Cloud Failover RPM package
`````````````````````````````````````````````````````````
F5 Networks provides a checksum for each Cloud Failover release so you can confirm the integrity of the RPM package.

You can get a checksum for a particular RPM by running one of the following commands, depending on your operating system:

- Linux: ``sha256sum <path_to_rpm>``

- Windows using CertUtil: ``CertUtil –hashfile <path_to_rpm> SHA256``

You can compare the checksum produced by that command against the **.sha256** file in the **dist** directory (https://github.com/F5Networks/f5-cloud-failover/tree/master/dist). 

.. WARNING:: Do not continue if the hash does not match.



Uploading and installing the Cloud Failover file on the BIG-IP
--------------------------------------------------------------
After you download the RPM, you must upload and then install it on your BIG-IP system. You can use the BIG-IP Configuration utility or cURL (alternatively, you can use SCP to upload the file to **/var/config/rest/downloads**, but you will still have to use the cURL command to install the package). Use only one of the following procedures.

.. _installgui-ref:


Installing Cloud Failover using the BIG-IP Configuration utility
````````````````````````````````````````````````````````````````

From the Configuration utility:

1. If you are using a BIG-IP version prior to 14.0, before you can use the Configuration utility, you must enable the framework using the BIG-IP command line. From the CLI, type the following command:  ``touch /var/config/rest/iapps/enable``.  You only need to run this command once per BIG-IP system.

2. Click **iApps > Package Management LX**.

3. Click the **Import** button.

4. Click **Choose File** and then browse to the location you saved the RPM file, and then click **Ok**.

5. Click the **Upload** button.


.. _installcurl-ref:

Installing Cloud Failover using cURL from the Linux shell
`````````````````````````````````````````````````````````

If you want to use cURL to install Cloud Failover, use the following command syntax. First, set the file name and the BIG-IP IP address and credentials, making sure you use the appropriate RPM file name, including build number, and BIG-IP credentials.

.. code-block:: shell

    FN=f5-cloud-failover-1.0.0-1.noarch.rpm

    CREDS=admin:password

    IP=IP address of BIG-IP

|

Copy the following commands to upload the package. If you uploaded the RPM by another method, you can skip these commands.

.. code-block:: shell

    LEN=$(wc -c $FN | cut -f 1 -d ' ')

    curl -kvu $CREDS https://$IP/mgmt/shared/file-transfer/uploads/$FN -H 'Content-Type: application/octet-stream' -H "Content-Range: 0-$((LEN - 1))/$LEN" -H "Content-Length: $LEN" -H 'Connection: keep-alive' --data-binary @$FN

|

Copy the following commands to install the package.

.. code-block:: shell

    DATA="{\"operation\":\"INSTALL\",\"packageFilePath\":\"/var/config/rest/downloads/$FN\"}"


    curl -kvu $CREDS "https://$IP/mgmt/shared/iapp/package-management-tasks" -H "Origin: https://$IP" -H 'Content-Type: application/json;charset=UTF-8' --data $DATA

|

Updating Cloud Failover
-----------------------
When F5 releases a new version of Cloud Failover, use the same procedure you used to initially install the RPM. For example, if you used the Configuration utility, when you click Import and then select the new RPM, the system recognizes you are upgrading CF.


Reverting to a previous version of Cloud Failover
-------------------------------------------------
If you need to revert to a previous version of Cloud Failover, you must first remove the version of Cloud Failover on your BIG-IP system:

On the BIG-IP user interface, click :guilabel:`iApps > Package Management LX > f5-cloud-failover > Uninstall`  

After you uninstall, you can import the RPM for the version of Cloud Failover you want to use.


|

.. _hash-ref:




.. |github| raw:: html

   <a href="https://github.com/F5Networks/f5-cloud-failover" target="_blank">F5 Cloud Failover site on GitHub</a>


.. |artifactory| raw:: html

   <a href="https://artifactory.f5.com/artifactory/list/ecosystems-f5-cloud-failover-rpm/" target="_blank">Artifactory</a>
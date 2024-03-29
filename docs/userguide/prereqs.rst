.. _prereqs:

Prerequisites and Requirements
------------------------------

The following are prerequisites for using Cloud Failover:


- You must be using BIG-IP version v14.1.0 or later.
- To use Cloud Failover Extension, your BIG-IP user account must have the **Administrator**
  role.
- You should be familiar with the F5 BIG-IP and F5 terminology. For
  general information and documentation on the BIG-IP system, see the
  `F5 Knowledge Center <https://techdocs.f5.com/en-us/bigip-14-1-0/big-ip-local-traffic-management-basics-14-1-0.html>`_.
- Each provider has their own prerequisites, see the invididual provider sections for more information.
- Your BIG-IPs must have DNS and NTP setup.

Here is a list of supported DNS and NTP servers for each cloud (see your cloud provider's documentation for the latest information or more details).

============== ================= ================== 
Cloud Provider        DNS                NTP       
============== ================= ================== 
     AWS        169.254.169.253   169.254.169.123    
    Azure       168.63.129.16     time.windows.com   
     GCP        169.254.169.254   169.254.169.254    
============== ================= ================== 
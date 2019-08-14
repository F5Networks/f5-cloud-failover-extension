#!/usr/bin/env bash

PATH_TO_DEPLOYMENT_INFO=$1

FIRST_IP=$(cat $PATH_TO_DEPLOYMENT_INFO | jq '.[] | select(.primary == true) | .mgmt_address' -r)
SECOND_IP=$(cat $PATH_TO_DEPLOYMENT_INFO | jq '.[] | select(.primary == false) | .mgmt_address' -r)

USERNAME=$(cat $PATH_TO_DEPLOYMENT_INFO | jq '.[] | select(.primary == true) | .admin_username' -r)
PASSWORD=$(cat $PATH_TO_DEPLOYMENT_INFO | jq '.[] | select(.primary == true) | .admin_password' -r)

echo "FIRST IP:${FIRST_IP}"
echo "SECOND IP: ${SECOND_IP}"
echo "PASSWORD: ${PASSWORD}"


echo "connecting to ${FIRST_IP}"

sshpass -p $PASSWORD scp -r src/nodejs/* azureuser@$FIRST_IP:/var/config/rest/iapps/f5-cloud-failover/nodejs
sshpass -p $PASSWORD ssh -o "StrictHostKeyChecking no" $USERNAME@$FIRST_IP 'bigstart restart restnoded'

echo "done with ${FIRST_IP}"
echo "connecting to ${SECOND_IP}"

sshpass -p $PASSWORD scp -r src/nodejs/* azureuser@$SECOND_IP:/var/config/rest/iapps/f5-cloud-failover/nodejs
sshpass -p $PASSWORD ssh -o "StrictHostKeyChecking no" $USERNAME@$SECOND_IP 'bigstart restart restnoded'

echo "done with ${SECOND_IP}"
echo "script execution completed"
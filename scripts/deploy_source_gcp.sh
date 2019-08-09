#!/usr/bin/env bash

FIRST_IP=$(cat test/functional/deployment/terraform/terraform.tfstate | jq '.resources[] | select(.name=="vm01") | .instances[].attributes.network_interface[1] | select(.name=="nic1") | .access_config[].nat_ip' | tr -d '"')
SECOND_IP=$(cat test/functional/deployment/terraform/terraform.tfstate | jq '.resources[] | select(.name=="vm02") | .instances[].attributes.network_interface[1] | select(.name=="nic1") | .access_config[].nat_ip' | tr -d '"')
PASSWORD=$(cat test/functional/deployment/terraform/terraform.tfstate | jq '.resources[] | select(.name=="admin_password") | .instances[].attributes.result' | tr -d '"')


echo "FIRST IP:${FIRST_IP}"
echo "SECOND IP: ${SECOND_IP}"
echo "PASSWORD: ${PASSWORD}"


echo "connecting to ${FIRST_IP}"

sshpass -p $PASSWORD scp -r src/nodejs/* azureuser@$FIRST_IP:/var/config/rest/iapps/f5-cloud-failover/nodejs
sshpass -p $PASSWORD ssh -o "StrictHostKeyChecking no" azureuser@$FIRST_IP 'bigstart restart restnoded'

echo "done with ${FIRST_IP}"
echo "connecting to ${SECOND_IP}"

sshpass -p $PASSWORD scp -r src/nodejs/* azureuser@$SECOND_IP:/var/config/rest/iapps/f5-cloud-failover/nodejs
sshpass -p $PASSWORD ssh -o "StrictHostKeyChecking no" azureuser@$SECOND_IP 'bigstart restart restnoded'

echo "done with ${SECOND_IP}"
echo "script execution completed"
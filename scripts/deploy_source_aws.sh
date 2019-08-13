#!/usr/bin/env bash

FIRST_IP=$(cat terraform.tfstate | jq '.resources[] | select(.name=="vm0") | .instances[].attributes.public_ip' | tr -d '"')
SECOND_IP=$(cat terraform.tfstate | jq '.resources[] | select(.name=="vm1") | .instances[].attributes.public_ip' | tr -d '"')
PASSWORD=$(cat terraform.tfstate | jq '.resources[] | select(.name=="admin_password") | .instances[].attributes.result' | tr -d '"')


echo "FIRST IP: ${FIRST_IP}"
echo "SECOND IP: ${SECOND_IP}"
echo "PASSWORD: ${PASSWORD}"


echo "connecting to ${FIRST_IP}"

sshpass -p $PASSWORD scp -r src/nodejs/* awsuser@$FIRST_IP:/var/config/rest/iapps/f5-cloud-failover/nodejs
sshpass -p $PASSWORD ssh -o "StrictHostKeyChecking no" awsuser@$FIRST_IP 'bigstart restart restnoded'

echo "done with ${FIRST_IP}"
echo "connecting to ${SECOND_IP}"

sshpass -p $PASSWORD scp -r src/nodejs/* awsuser@$SECOND_IP:/var/config/rest/iapps/f5-cloud-failover/nodejs
sshpass -p $PASSWORD ssh -o "StrictHostKeyChecking no" awsuser@$SECOND_IP 'bigstart restart restnoded'

echo "done with ${SECOND_IP}"
echo "script execution completed"

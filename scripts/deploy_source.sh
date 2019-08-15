#!/usr/bin/env bash

PATH_TO_DEPLOYMENT_INFO=${1:-deployment_info.json}
INSTANCES=$(cat $PATH_TO_DEPLOYMENT_INFO | jq .instances -r)


FIRST_IP=$(echo $INSTANCES | jq '.[] | select(.primary == true) | .mgmt_address' -r)
SECOND_IP=$(echo $INSTANCES | jq '.[] | select(.primary == false) | .mgmt_address' -r)
USERNAME=$(echo $INSTANCES | jq '.[] | select(.primary == true) | .admin_username' -r)
PASSWORD=$(echo $INSTANCES | jq '.[] | select(.primary == true) | .admin_password' -r)

for HOST in ${FIRST_IP} ${SECOND_IP}; do
	echo "IP: ${HOST} USER: ${USERNAME} PASSWORD: ${PASSWORD}"
    sshpass -p $PASSWORD scp -r src/nodejs/* ${USERNAME}@${HOST}:/var/config/rest/iapps/f5-cloud-failover/nodejs
    sshpass -p $PASSWORD ssh -o "StrictHostKeyChecking no" ${USERNAME}@${HOST} 'bigstart restart restnoded'
    echo "done with ${HOST}"
done

echo "script execution completed"
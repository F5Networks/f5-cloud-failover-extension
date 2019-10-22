#!/bin/bash
# helper script to deploy infrastructure based on environment
# usage: ./deploy.sh azure create

# note: running on linux/unix may require sudo (?)

set -e

environment=${1}
action=${2:-create}
script_location=$(dirname "$0")

# validate input
if [[ -z "$environment" ]]; then
  echo "Environment must be provided!"
  exit 1
fi

# install python dependencies
python3 -m venv venv && source venv/bin/activate
pip install -r ${script_location}/requirements.txt

# support create|delete|show
if [[ ${action} == "create" ]]; then
    terraform init ${script_location}/terraform/${environment}
    terraform apply -auto-approve ${script_location}/terraform/${environment}
    terraform output -json
    echo $(terraform output -json) | jq .deployment_info.value -r > deployment_info.json
elif [[ ${action} == "delete" ]]; then
    terraform init ${script_location}/terraform/${environment}
    terraform destroy -auto-approve ${script_location}/terraform/${environment}
elif [[ ${action} == "show" ]]; then
    terraform output -json
    echo $(terraform output -json) | jq .deployment_info.value -r > deployment_info.json
else
    echo "Unknown action: ${action}"
    exit 1
fi

# perform any cleanup necessary
deactivate && rm -rf venv
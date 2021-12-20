#!make
current_dir := $(shell pwd)
# Create an environmental script and refernce it here (.gitignore set to ignore env.sh)
# example: export GOOGLE_PROJECT_ID=my_project_id
# option 1 all env variables refrenced in rules need be defined in env.sh
# option 2 have env vars set prior to running make rule
include env.sh
.PHONY: help
help:
	@echo "Please use \`make <target>' where <target> is one of"
	@echo " 'run_functional_test_gcp' using deployment tool docker image:latest, gcp CFE tests. Note env.sh file required to populate required env vars."

.PHONY: gce
env:
	env

create_functional_test_gcp:
	docker run -it -v ${current_dir}/test:/local -e GOOGLE_CREDENTIALS="${GOOGLE_CREDENTIALS}" -e F5_DISABLE_CERT_VERIFY="true" -e CF_ENV_USE_FORWARDING_RULE="false" -e GOOGLE_PROJECT_ID="${GOOGLE_PROJECT_ID}" -e GOOGLE_PROJECT_ID="${GOOGLE_PROJECT_ID}" -e ARTIFACTORY_SERVER="${ARTIFACTORY_SERVER}" ${ARTIFACTORY_SERVER}/ecosystems-cloudsolutions-docker-dev/deployment-tool:latest /deployment-tool/deploy.sh --deployment-plan ${CF_ENV_CLOUD_GCP} --action create --output-folder ../local/${CF_ENV_CLOUD_GCP}_${CF_ENV_NETWORK_TOPOLOGY_GCP}_${CF_ENV_NIC_COUNT_GCP}_${CF_ENV_REGION_GCP} --deployment-vars region:\"${CF_ENV_REGION_GCP}\" --skip-requirements "true"

delete_functional_test_gcp:
	 docker run -it -v ${current_dir}/test:/local -e GOOGLE_CREDENTIALS="${GOOGLE_CREDENTIALS}" -e F5_DISABLE_CERT_VERIFY="true" -e CF_ENV_USE_FORWARDING_RULE="false" -e GOOGLE_PROJECT_ID="${GOOGLE_PROJECT_ID}" -e GOOGLE_PROJECT_ID="${GOOGLE_PROJECT_ID}" -e ARTIFACTORY_SERVER="${ARTIFACTORY_SERVER}" ${ARTIFACTORY_SERVER}/ecosystems-cloudsolutions-docker-dev/deployment-tool:latest bash -c "cp -a ../local/${CF_ENV_CLOUD_GCP}_${CF_ENV_NETWORK_TOPOLOGY_GCP}_${CF_ENV_NIC_COUNT_GCP}_${CF_ENV_REGION_GCP}/. . | /deployment-tool/deploy.sh --deployment-plan ${CF_ENV_CLOUD_GCP} --action delete --deployment-vars region:\\\"${CF_ENV_REGION_GCP}\\\" --skip-requirements \"true\""

create_functional_test_aws:
	docker run -it -v ${current_dir}/test:/local -e AWS_ACCESS_KEY_ID="${AWS_ACCESS_KEY_ID}" -e  AWS_SECRET_ACCESS_KEY="${AWS_SECRET_ACCESS_KEY}" -e AWS_DEFAULT_REGION="${AWS_DEFAULT_REGION}" -e F5_DISABLE_CERT_VERIFY="true" -e ARTIFACTORY_SERVER="${ARTIFACTORY_SERVER}" ${ARTIFACTORY_SERVER}/ecosystems-cloudsolutions-docker-dev/deployment-tool:latest /deployment-tool/deploy.sh --deployment-plan ${CF_ENV_CLOUD_AWS} --action create --output-folder ../local/${CF_ENV_CLOUD_AWS}_${CF_ENV_NETWORK_TOPOLOGY_AWS}_${CF_ENV_NIC_COUNT_AWS}_${CF_ENV_REGION_AWS} --deployment-vars region:\"${CF_ENV_REGION_AWS}\" --skip-requirements "true"

delete_functional_test_aws:
	 docker run -it -v ${current_dir}/test:/local -e AWS_ACCESS_KEY_ID="${AWS_ACCESS_KEY_ID}" -e  AWS_SECRET_ACCESS_KEY="${AWS_SECRET_ACCESS_KEY}" -e AWS_DEFAULT_REGION="${AWS_DEFAULT_REGION}" -e F5_DISABLE_CERT_VERIFY="true" -e ARTIFACTORY_SERVER="${ARTIFACTORY_SERVER}" ${ARTIFACTORY_SERVER}/ecosystems-cloudsolutions-docker-dev/deployment-tool:latest bash -c "cp -a ../local/${CF_ENV_CLOUD_AWS}_${CF_ENV_NETWORK_TOPOLOGY_AWS}_${CF_ENV_NIC_COUNT_AWS}_${CF_ENV_REGION_AWS}/. . | /deployment-tool/deploy.sh --deployment-plan ${CF_ENV_CLOUD_AWS} --action delete --deployment-vars region:\\\"${CF_ENV_REGION_AWS}\\\" --skip-requirements \"true\""

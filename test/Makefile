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
	docker run -it -v ${current_dir}/test:/local -e GOOGLE_CREDENTIALS="${GOOGLE_CREDENTIALS}" -e F5_DISABLE_CERT_VERIFY="true" -e CF_ENV_USE_FORWARDING_RULE="false" -e GOOGLE_PROJECT_ID="${GOOGLE_PROJECT_ID}" -e GOOGLE_PROJECT_ID="${GOOGLE_PROJECT_ID}" -e ARTIFACTORY_SERVER="${ARTIFACTORY_SERVER}" deployment-tool:test /deployment-tool/deploy.sh --deployment-plan ${CF_ENV_CLOUD} --action create --output-folder ../local/${CF_ENV_CLOUD}_${CF_ENV_NETWORK_TOPOLOGY}_${CF_ENV_NIC_COUNT}_${CF_ENV_REGION} --deployment-vars region:\"${CF_ENV_REGION}\" --skip-requirements "true"

delete_functional_test_gcp:
	 docker run -it -v ${current_dir}/test:/local -e GOOGLE_CREDENTIALS="${GOOGLE_CREDENTIALS}" -e F5_DISABLE_CERT_VERIFY="true" -e CF_ENV_USE_FORWARDING_RULE="false" -e GOOGLE_PROJECT_ID="${GOOGLE_PROJECT_ID}" -e GOOGLE_PROJECT_ID="${GOOGLE_PROJECT_ID}" -e ARTIFACTORY_SERVER="${ARTIFACTORY_SERVER}" deployment-tool:test bash -c "cp -a ../local/${CF_ENV_CLOUD}_${CF_ENV_NETWORK_TOPOLOGY}_${CF_ENV_NIC_COUNT}_${CF_ENV_REGION}/. . | /deployment-tool/deploy.sh --deployment-plan ${CF_ENV_CLOUD} --action delete --deployment-vars region:\\\"${CF_ENV_REGION}\\\" --skip-requirements \"true\""

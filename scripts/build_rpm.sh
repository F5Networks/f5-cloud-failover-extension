#!/bin/bash

set -e

# path to the project root directory
MAINDIR=$(git rev-parse --show-toplevel)

# clean up node modules and install a npm build
rm -rf ${MAINDIR}/node_modules
npm run install-production --prefix ${MAINDIR}


FINALBUILDDIR=${MAINDIR}/dist/new_build
mkdir -p ${FINALBUILDDIR}
VERSION=$(cat ${MAINDIR}/package.json | jq .version -r)
RELEASE=${VERSION##*.}
PKG_NAME=$(cat ${MAINDIR}/package.json | jq .name -r)
cd ${MAINDIR}
rpmbuild -bb \
    --define "main ${MAINDIR}" \
    --define '_topdir %{main}/rpmbuild' \
    --define "_name ${PKG_NAME}" \
    --define "_release ${RELEASE}" \
    --define "_version ${VERSION}" \
    f5-cloud-failover.spec
cd ${MAINDIR}/rpmbuild/RPMS/noarch
FN=$(ls -t *.rpm 2>/dev/null | head -1)
cp ${FN} ${FINALBUILDDIR}
sha256sum "${FN}" > "${FINALBUILDDIR}/${FN}.sha256"

cd ${MAINDIR}
rm -rf rpmbuild/
echo "RPM FILE ${FINALBUILDDIR}/${FN}"

# reinstall all dependencies
npm install --unsafe-perm

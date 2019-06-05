#!/bin/bash

set -e

MAINDIR=$(pwd)
FINALBUILDDIR=${MAINDIR}/dist/new_build
mkdir -p ${FINALBUILDDIR}
RELEASE='1'
VERSION=$(cat ${MAINDIR}/package.json | jq .version -r)
PKG_NAME=$(cat ${MAINDIR}/package.json | jq .name -r)

rpmbuild -bb \
    --define "main $(pwd)" \
    --define '_topdir %{main}/rpmbuild' \
    --define "_name ${PKG_NAME}" \
    --define "_release ${RELEASE}" \
    --define "_version ${VERSION}" \
    f5-cloud-failover.spec
cd rpmbuild/RPMS/noarch
FN=$(ls -t *.rpm 2>/dev/null | head -1)
cp ${FN} ${FINALBUILDDIR}
sha256sum "${FN}" > "${FINALBUILDDIR}/${FN}.sha256"

cd ${MAINDIR}
rm -rf rpmbuild/
echo "RPM FILE ${FINALBUILDDIR}/${FN}"
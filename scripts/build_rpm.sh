#!/bin/bash

set -e

# path to the project root directory
MAINDIR=$(git rev-parse --show-toplevel)

# clean up node modules and install a npm build
rm -rf ${MAINDIR}/node_modules
npm run install-production --prefix ${MAINDIR}

# remove optional build/doc/test tooling (redoc, dredd, etc.) from node_modules
# so it is NOT packaged into the RPM. This tooling is only used at build time and
# never runs in the extension, but the spec copies node_modules wholesale and
# npm 6 --no-optional does not prune lockfile-pinned optional deps. Pruning here
# keeps the shipped artifact free of those (vulnerability-flagged) trees.
node ${MAINDIR}/scripts/prune_packaged_modules.js

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

# reinstall all dependencies (install-all also strips the dead xmldom@0.6.0
# from the lockfile and removes resolved fields, keeping the tree consistent)
npm run install-all --prefix ${MAINDIR}

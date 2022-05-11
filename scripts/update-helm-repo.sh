#!/bin/bash
set -e

pushd tmp

rm -rf helm
git clone https://github.com/gyf304/helm.git

pushd helm
helm package ../../chart
helm repo index .
git add .
git commit -m "update helm repo"
git push

popd
popd

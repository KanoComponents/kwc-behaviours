modulizer --out . \
--npm-name @kano/kwc-behaviors \
--npm-version 3.0.0-beta.4 \
--import-style name \
--dependency-mapping platform.js,platform,^1.3.5 \
--dependency-mapping js-md5,blueimp-md5,^2.10

sed -i "s|build/md5.min.js|js/md5.js|g" kwc-tracking.js

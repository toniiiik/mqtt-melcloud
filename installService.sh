#!/bin/bash

DIR=/opt/mqtt-melcloud

cp ${DIR}/melcloud.service /etc/systemd/system/melcloud.service

systemctl daemon-reload
systemctl enable melcloud
systemctl start melcloud
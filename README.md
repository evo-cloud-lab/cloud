# Evo Cloud Suite

The single package include all Evo Cloud services.
This package provides an all-in-one CLI tool to manage all services.

## How to Play

Version 0.0.1 is integrated into [stemcell](https://github.com/evo-cloud/stemcell). 
Use _stemcell_ to build the rootfs which already contains _evo-cloud_ version 0.0.1.

Make sure you've installed [grunt-cli](http://gruntjs.com/): `npm install grunt-cli -g`

```bash
git clone https://github.com/evo-cloud/stemcell
cd stemcell
grunt
```

Now you have rootfs ready: `_build/rel/rootfs-core-0.0.1/rootfs.squashfs`.

Install [evo-garage](https://github.com/evo-cloud/garage) which helps to create Linux containers,
and start `garage-server` with root priviledge.

```bash
npm install evo-garage -g
sudo garage-server
```

Create a folder for containers

```bash
mkdir -p ~/my-clusters/evo
mkdir -p ~/my-clusters/evo/config-rootfs/etc/cloud.d
cat >~/my-clusters/evo/config-rootfs/etc/cloud.d/shared.conf <<EOF
---
connector:
    cluster: my-evo-cluster
EOF
```

Create a configuration file: `~/my-clusters/evo/cluster.yml`

```yaml
---
script: lxc
env:
    ROOTFS0: /path/stemcell/_build/rel/rootfs-core-0.0.1/rootfs.squashfs
    ROOTFS1: /home/user/my-clusters/evo/config-rootfs
    NICS: lxcbr0 evobr0
```

Prepare network environment on you host 
(assume [lxc](http://lxc.sourceforge.net) is already installed and `lxcbr0` is managed by _lxc_)

```bash
sudo brctl addbr evobr0
sudo ifconfig evobr0 up
sudo modprobe bonding max_bonds=0
```

Loading bonding driver on host is required as Evo Cloud uses bonding driver.

Now, it's exciting moment!

```bash
garage add-clusters /home/user/my-clusters/evo
garage start evo 1-8
```

We created 8 containers named `evo-1` to `evo-8`. 
Let's connect one of them:

```bash
sudo lxc-console -n evo-1
```

You will see the network is managed automatically, and all the nodes are connecting together
to form a single cluster.

It's easy to use `evo-cloud` to monitor the status.
Inside the container:

```bash
evo-cloud con:monitor
```

## What's Next

Version 0.0.1 only integrates `evo-connector` which automatically sets up the cluster.
Even `evo-connector` is not stable. The whole suite is built for development at current phase.

---
title: "Terraform vs AWS : Chronique d'une matinée en enfer"
date: 2026-01-18T11:14:00+01:00
draft: false
tags: ["Terraform", "AWS", "GitLab", "OpenTofu", "SRE"]
categories: ["Rex"]
---

# Journal : 16 janvier 2026

Je pensais que provisionner une petite instance Rocky Linux sur un serveur AWS en utilisant Terraform serait une formalité. Spoiler: j'ai fini par me battre avec des licenses, des back-ends HTTP, et l'interface *imbuvable* d'Amazon.

Voici le résumé de ma première vraie confrontation avec l'Infrastructure as Code. 

## 1. Le drame HashiCorp : OpenTofu à la rescousse (ou pas)

Puisqu'on a commencé avec Terraform, autant aller jusqu'au bout, et faire un projet Gitlab et faire un CI-CD qui fait tout à notre place. 

D'après ce qu'on voit écrit dans les tutoriels en ligne, c'est très simple : Gitlab possède un template Terraform très efficace, il suffit d'écrire quelques lignes bien placées dans le `.gitlab-ci.yml`, et le compte y est.

**Sauf que spoiler: non**. 

En fait, depuis le changement de license d'HashiCorp (passage à la BSL), ce fameux template a pris un sacré coup de vieux. 

En fait, il est obsolète. Ça ne marche tout simplement pas avec les nouvelles versions.  
Résultat : passage obligé à **OpenTofu**. C'est techniquement un fork, mais en pratique, c'est une étape de complexité de plus dans la pipeline : On passe de 4 à 5 étapes (`validate`, `build`, `test`, `deploy`), en plus de ramener toute la configuration à la main dans le fichier CI, et de rencontrer des erreurs de registry à se taper le front contre un mur ou à s'arracher les cheuveux (à vous de choisir).

Bref, bienvenue dans l'ère open-source post-2024.

## 2. La galère des images AWS Marketplace

Connaissez-vous le monde merveilleux des images AWS Marketplace ? Si vous êtes du métier, très certainement, mais sinon, laissez-moi faire les présentations.

Si on veut lancer une VM et automatiser le processus (comme on est en train de le faire, merci Sherlock) avec Terraform, il nous faut une image (AMI) pour notre instance EC2. Et comment la trouver ? 

Déjà, eh bien il faut trouver une distribution (Linux, bien entendu), et pour ça, eh bien il n'y a pas de secret. Soit on est de l'école Debian/Ubuntu (et on préfère `APT`), soit on est du clan RedHat, et on préfère CentOS (RIP) ou Rocky Linux.

Perso, je préfère Debian, mais comme je suis illogique au possible, je vais choisir Rocky Linux. 

### Owner ID, owner ID, owner ID

Ah, oui, en fait parce qu'il y a une petite subtilité : les `owner_id`. En fait, le meilleur moyen pour être sûr qu'on télécharge la bonne image (et pas un fake chinois), c'est d'être sûr qu'elle est émise par la bonne personne. AWS a une solution (très reloue) pour ça : le ID d'owner.

Là où c'est un peu la guerre, c'est que c'est un genre de chasse aux oeufs géante : faut les trouver. La plupart du temps, ils sont dans les tutos sur les blogs, par exemple.

Voici donc par exemple celui de Rocky Linux : `679593333241`, ou encore celui de Debian : `136693071363`.

### Trouver la bonne version avec la bonne architecture avec le bon type d'instance

Une fois qu'on a trouvé la bonne distribution, eh bien on a fait vraiment très peu du travail qu'il reste à faire. Il nous faut encore trouver le bon nom d'image : donc la bonne version, avec le bon type d'instance (EC2 dans notre cas), avec la bonne architecture.
On utilise donc cette commande magique : 

```bash
aws ec2 describe-images --owners "owner_ID" --filters "Name=machin,etc..."
# Où on remplace owner_ID par notre owner_ID
```

On tombe sur une réponse en JSON où il va falloir déchiffrer la bonne version. Et ensuite, on en déduit quels filtres on veut mettre (le bon nom pour garder une version compatible, avec la bonne architecture). Par exemple pour Rocky Linux 9 x86_64 EC2 : `Rocky-9-EC2-Base*x86_64*`

On a donc cette entrée finale dans notre fichier `main.tf` : 

```tf
# 1. On récupère Rocky Linux 9 officiel
data "aws_ami" "rocky" {
	most_recent = true
	owners = ["679593333241"]
	filter {
		name = "name"
		values = ["Rocky-9-EC2-Base*x86_64*"]
	}
}
```

### 3. (Presque) la fin des galères : les conditions d'utilisation 

Quelle erreur ferait-on de penser que ce serait la fin des galères après ça ! Il nous reste encore une étape (et la pire de toutes) : celle des **conditions d'utilisation de l'image**. 

Pour rappel, on bosse ici avec du matériel d'entreprise. Niveau légal, c'est donc... complexe. Il faut donc bien accepter le contrat d'utilisation avant de pouvoir se servir de l'image désirée.

Le plus rapide est de lancer une première fois un `terraform apply`, et de tomber sur cette erreur de conditions d'utilisation. Terraform nous donne tout simplement un lien à suivre pour accéder directement à la page du marketplace de la bonne image.

Une fois cela fait, il suffit de cliquer sur le bouton jaune "subscribe", puis une deuxième fois sur le même bouton au bas de la page.

Et voilà ! Normalement plus de blocage, ça fonctionne bien comme prévu ! 

## 3. La règle d'or : Ne JAMAIS (au grand JAMAIS) commit le `.tfstate`

... Ou peut-être que si ? 

Non, non, attendez, ne partez pas ! 

Un truc que j'avais ignoré avec Terraform, c'est... eh bien le principe du `.tfstate`. Jeune et insouciant que je suis, j'avais cru (par déni ou envie de simplification) que Terraform regardait sur notre espace AWS quelles instances existaient, quelle était leur image, etc. Un peu comme Ansible le ferait avec une configuration système, mais pour des VMs. Enfin bref. 

Ayant donc fait des tests en local (décidé à faire marcher mon `main.tf` avant d'aller affronter OpenTofu), quelle ne fut pas ma surprise en passant sur Gitlab : 

```
Error: error creating Security Group (allow_ssh_ethan): InvalidGroup. Duplicate: The security group 'allow_ssh_ethan' already exists for VPC 'vpc-04c85d1cc082f5607'

status code: 400, request id: 7a443ab1-6f37-497f-8e33-88f4c0245816
```

OK. Fun. En fait, Terraform stocke ce qu'il fait dans un fichier, et ce fichier, c'est précisément notre `.tfstate`. 

À ce moment-là, je me suis demandé comment j'allais faire. Flemme de tout détruire pour juste relancer le build sur Gitlab (c'est ce que j'ai fini par faire, mais attendez la suite), parce que ce n'est pas une solution durable.

J'ai trouvé la réponse dans une composante du fonctionnement de Terraform : configurer un **backend HTTP** sur mon serveur Gitlab. 

Voici donc le bout de config qui m'a sauvé la mise : 

```yaml
# Setup du backend pour éviter les conflits (Locking)
before_script:
  - export TF_HTTP_ADDRESS="${CI_API_V4_URL}/projects/${CI_PROJECT_ID}/terraform/state/default"
  - export TF_HTTP_USERNAME="gitlab-ci-token"
  - export TF_HTTP_PASSWORD="${CI_JOB_TOKEN}"
  - export TF_HTTP_LOCK_METHOD="POST"
  - export TF_HTTP_UNLOCK_METHOD="DELETE"
```

Après ça, normalement, plus d'erreur. Il a fallu quand même quelques tentatives pour que ça fonctionne (et se détacher du template OpenTofu qui commençait sérieusement à me taper sur le système), mais tout a fini par fonctionner correctement.


## 4. AWS et la clé SSH

Le truc qui est piégeur avec l'exécution en local (ce que j'ai fait sur mon PC avec les commandes `terraform machin`), c'est que Terraform n'est pas bête. Il va automatiquement utiliser l'outil CLI `aws` (que j'ai configuré), pour obtenir des clés sans passer par la case variables d'environnement un peu reloues. C'est juste une jolie page d'OAuth qui ensuite ne réapparaît plus jamais. 

Sauf que quand on l'exécute sur Gitlab, Terraform n'a pas accès à ces informations. Il doit donc aller les chercher soit dans notre fichier de configuration (`variables.tf`, ce qui au passage est tout simplement **la pire des idées**), soit dans une variable d'environnement : `TF_VAR_AWS_KEY`. 

> **Pourquoi `TF_VAR` devant ?  
> C'est vrai ça ! Si notre variable dans le fichier Terraform s'appelle `AWS_KEY`, pourquoi la variable d'environnement a un nom différent ? Parce que Terraform, pour éviter les conflits avec d'autres variables d'environnement (typiquement `HOSTNAME`), va utiliser le préfixe `TF_VAR` pour reconnaître ce qui lui est dû. 

Donc il faut ajouter une variable d'environnement à l'exécution sur Gitlab. Heureusement, ils ont prévu le coup, il a donc fallu l'ajouter dans la bonne section dans les paramètres du projet Gitlab.

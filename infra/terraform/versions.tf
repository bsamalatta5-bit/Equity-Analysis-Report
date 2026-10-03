terraform {
  required_version = "= 1.9.8" # Section 3 pin.

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.70"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.6"
    }
  }

  # Unconfigured deliberately: a real deployment points this at an S3
  # bucket + DynamoDB lock table (or Terraform Cloud) provisioned once,
  # out of band, before this configuration's first `terraform init`. No
  # backend exists to point at yet — see README.md.
  # backend "s3" {}
}

provider "aws" {
  region = var.aws_region
}

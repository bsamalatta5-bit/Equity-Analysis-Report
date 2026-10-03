# Network: a VPC with public subnets (load balancer only) and private
# subnets (everything else — database, cache, compute never get a public
# IP). Two AZs for the RDS/ElastiCache multi-AZ options used below.

locals {
  name_prefix        = "${var.project_name}-${var.environment}"
  availability_zones = slice(data.aws_availability_zones.available.names, 0, 2)
}

data "aws_availability_zones" "available" {
  state = "available"
}

resource "aws_vpc" "main" {
  cidr_block           = "10.20.0.0/16"
  enable_dns_support   = true
  enable_dns_hostnames = true

  tags = { Name = "${local.name_prefix}-vpc" }
}

resource "aws_internet_gateway" "main" {
  vpc_id = aws_vpc.main.id
  tags   = { Name = "${local.name_prefix}-igw" }
}

resource "aws_subnet" "public" {
  count                   = length(local.availability_zones)
  vpc_id                  = aws_vpc.main.id
  cidr_block              = cidrsubnet(aws_vpc.main.cidr_block, 8, count.index)
  availability_zone       = local.availability_zones[count.index]
  map_public_ip_on_launch = true

  tags = { Name = "${local.name_prefix}-public-${count.index}" }
}

resource "aws_subnet" "private" {
  count             = length(local.availability_zones)
  vpc_id            = aws_vpc.main.id
  cidr_block        = cidrsubnet(aws_vpc.main.cidr_block, 8, count.index + 10)
  availability_zone = local.availability_zones[count.index]

  tags = { Name = "${local.name_prefix}-private-${count.index}" }
}

resource "aws_route_table" "public" {
  vpc_id = aws_vpc.main.id

  route {
    cidr_block = "0.0.0.0/0"
    gateway_id = aws_internet_gateway.main.id
  }

  tags = { Name = "${local.name_prefix}-public-rt" }
}

resource "aws_route_table_association" "public" {
  count          = length(aws_subnet.public)
  subnet_id      = aws_subnet.public[count.index].id
  route_table_id = aws_route_table.public.id
}

# A NAT gateway per AZ so a private-subnet outage in one AZ (e.g. a NAT
# gateway failure) doesn't take compute down in the other — real
# production topology, not a single-NAT cost-cutting shortcut.
resource "aws_eip" "nat" {
  count  = length(local.availability_zones)
  domain = "vpc"
  tags   = { Name = "${local.name_prefix}-nat-eip-${count.index}" }
}

resource "aws_nat_gateway" "main" {
  count         = length(local.availability_zones)
  allocation_id = aws_eip.nat[count.index].id
  subnet_id     = aws_subnet.public[count.index].id
  tags          = { Name = "${local.name_prefix}-nat-${count.index}" }

  depends_on = [aws_internet_gateway.main]
}

resource "aws_route_table" "private" {
  count  = length(local.availability_zones)
  vpc_id = aws_vpc.main.id

  route {
    cidr_block     = "0.0.0.0/0"
    nat_gateway_id = aws_nat_gateway.main[count.index].id
  }

  tags = { Name = "${local.name_prefix}-private-rt-${count.index}" }
}

resource "aws_route_table_association" "private" {
  count          = length(aws_subnet.private)
  subnet_id      = aws_subnet.private[count.index].id
  route_table_id = aws_route_table.private[count.index].id
}

resource "aws_security_group" "load_balancer" {
  name_prefix = "${local.name_prefix}-alb-"
  vpc_id      = aws_vpc.main.id
  description = "Public ALB — inbound 443 from the internet only."

  ingress {
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = { Name = "${local.name_prefix}-alb-sg" }
}

resource "aws_security_group" "compute" {
  name_prefix = "${local.name_prefix}-compute-"
  vpc_id      = aws_vpc.main.id
  description = "apps/api, apps/voice-gateway, apps/dashboard tasks — inbound only from the load balancer."

  ingress {
    from_port       = 0
    to_port         = 65535
    protocol        = "tcp"
    security_groups = [aws_security_group.load_balancer.id]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = { Name = "${local.name_prefix}-compute-sg" }
}

resource "aws_security_group" "database" {
  name_prefix = "${local.name_prefix}-db-"
  vpc_id      = aws_vpc.main.id
  description = "RDS Postgres — inbound 5432 from compute only, never public."

  ingress {
    from_port       = 5432
    to_port         = 5432
    protocol        = "tcp"
    security_groups = [aws_security_group.compute.id]
  }

  tags = { Name = "${local.name_prefix}-db-sg" }
}

resource "aws_security_group" "cache" {
  name_prefix = "${local.name_prefix}-cache-"
  vpc_id      = aws_vpc.main.id
  description = "ElastiCache Redis — inbound 6379 from compute only."

  ingress {
    from_port       = 6379
    to_port         = 6379
    protocol        = "tcp"
    security_groups = [aws_security_group.compute.id]
  }

  tags = { Name = "${local.name_prefix}-cache-sg" }
}

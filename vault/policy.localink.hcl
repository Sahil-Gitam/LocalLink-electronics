# Allow the app to read its secrets under secret/data/localink/*
path "secret/data/localink/*" {
  capabilities = ["read", "list"]
}

# Allow dynamic database credentials
path "database/creds/localink-db" {
  capabilities = ["read"]
}

# Deny access to all other secret paths
path "*" {
  capabilities = ["deny"]
}

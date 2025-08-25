# Seed extended COA for ALL tenants (idempotent)
$headers = @{ 'X-Job-Key' = 'dev-job-key' }
Invoke-RestMethod -Method Post -Uri http://localhost:4000/api/admin/seed-coa-all-tenants -Headers $headers

# (Optional) Seed only the current tenant (dev)
Invoke-RestMethod -Method Post -Uri http://localhost:4000/api/setup/seed-coa?preset=us-gaap
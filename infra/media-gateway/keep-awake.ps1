# ============================================================================
#  ZiBTV - Passerelle : garde le systeme eveille + supervise node.
#
#  Empeche la mise en veille du PC TANT QUE cette fenetre est ouverte, sans
#  toucher aux reglages globaux de Windows : l'etat est demande via l'API
#  SetThreadExecutionState et libere automatiquement des que le process se
#  termine (fermeture de la fenetre, arret, plantage). L'ecran, lui, peut
#  s'eteindre : seul le SYSTEME reste eveille (ES_SYSTEM_REQUIRED).
#
#  Relance aussi node si la passerelle s'arrete anormalement. Pour arreter :
#  ferme cette fenetre.
# ============================================================================

Set-Location -Path $PSScriptRoot

$signature = '[DllImport("kernel32.dll")] public static extern uint SetThreadExecutionState(uint esFlags);'
$power = Add-Type -MemberDefinition $signature -Name Power -Namespace ZiBTV -PassThru

$ES_CONTINUOUS = [uint32]2147483648        # 0x80000000
$ES_SYSTEM_REQUIRED = [uint32]1            # 0x00000001

# Demande : rester eveille en continu tant que ce process vit.
[void]$power::SetThreadExecutionState($ES_CONTINUOUS -bor $ES_SYSTEM_REQUIRED)

try {
  while ($true) {
    node server.mjs
    Write-Host ''
    Write-Host '[redemarrage] la passerelle a quitte. Relance dans 3 s...'
    Write-Host '              (ferme cette fenetre pour arreter definitivement)'
    Start-Sleep -Seconds 3
  }
} finally {
  # Libere l'etat (best-effort ; Windows le libere de toute facon a la sortie).
  [void]$power::SetThreadExecutionState($ES_CONTINUOUS)
}

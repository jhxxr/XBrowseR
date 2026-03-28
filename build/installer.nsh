!macro customUnInstallCheck
  ${If} $R0 == 2
    DetailPrint "Ignoring legacy uninstaller exit code 2 during upgrade."
    ClearErrors
    StrCpy $R0 0
    Return
  ${EndIf}
!macroend

!macro customUnInstall
  ${IfNot} ${isUpdated}
  ${AndIfNot} ${Silent}
    IfFileExists "$INSTDIR\data" 0 uninstallChoiceDone
    Delete "$PLUGINSDIR\delete-install-data"

    MessageBox MB_YESNOCANCEL|MB_ICONQUESTION "Delete legacy local data left in the installation directory as well?$\r$\n$\r$\nYes: remove $INSTDIR\data$\r$\nNo: keep that folder" /SD IDCANCEL IDYES deleteData IDNO keepData

    Abort

    deleteData:
      FileOpen $0 "$PLUGINSDIR\delete-install-data" w
      FileClose $0
      Goto uninstallChoiceDone

    keepData:
      Goto uninstallChoiceDone

    uninstallChoiceDone:
  ${EndIf}
!macroend

!macro customRemoveFiles
  IfFileExists "$PLUGINSDIR\delete-install-data" deleteAll preserveData

  deleteAll:
    SetOutPath $TEMP
    RMDir /r $INSTDIR
    Goto removeDone

  preserveData:
    IfFileExists "$INSTDIR\data" 0 removeWithoutData
    Rename "$INSTDIR\data" "$PLUGINSDIR\preserved-data"
    SetOutPath $TEMP
    RMDir /r $INSTDIR
    CreateDirectory "$INSTDIR"
    Rename "$PLUGINSDIR\preserved-data" "$INSTDIR\data"
    Goto removeDone

  removeWithoutData:
    SetOutPath $TEMP
    RMDir /r $INSTDIR

  removeDone:
!macroend

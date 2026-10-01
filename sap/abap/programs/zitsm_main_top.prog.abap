DATA: BEGIN OF gs_screen,
        incident_no   TYPE zitsm_de_incident_no,
        title         TYPE zitsm_de_title,
        description   TYPE string,
        priority      TYPE zitsm_de_priority,
        status        TYPE zitsm_de_status,
        reporter      TYPE syuname,
        assigned_to   TYPE syuname,
        created_on    TYPE dats,
        created_at    TYPE tims,
        closed_on     TYPE dats,
        closed_at     TYPE tims,
        priority_text TYPE val_text,
        status_text   TYPE val_text,
      END OF gs_screen.

DATA: BEGIN OF gs_new,
        title         TYPE zitsm_de_title,
        priority      TYPE zitsm_de_priority,
        assigned_to   TYPE syuname,
        priority_text TYPE val_text,
      END OF gs_new.

DATA go_container_new TYPE REF TO cl_gui_custom_container.
DATA go_editor_new    TYPE REF TO cl_gui_textedit.

DATA gt_incidents    TYPE STANDARD TABLE OF zitsm_incident.

TYPES: BEGIN OF ty_display.
         INCLUDE TYPE zitsm_incident.

         TYPES:
         status_text   TYPE char20,
         priority_text TYPE char20,
         coltab        TYPE slis_t_specialcol_alv,
       END OF ty_display.
DATA gt_display TYPE STANDARD TABLE OF ty_display.

DATA gv_sel_incident TYPE zitsm_de_incident_no.
DATA gv_cursor TYPE dynfnam.

DATA go_container TYPE REF TO cl_gui_custom_container.
DATA go_editor    TYPE REF TO cl_gui_textedit.


DATA gv_incident_no TYPE zitsm_de_incident_no.
DATA gt_fieldcat    TYPE slis_t_fieldcat_alv.
DATA gs_layout      TYPE slis_layout_alv.
DATA gv_reporter    TYPE syuname.
DATA gv_assigned_to TYPE syuname.
DATA gv_status      TYPE zitsm_de_status.
DATA gv_priority    TYPE zitsm_de_priority.
DATA gv_created_on  TYPE dats.


SELECTION-SCREEN BEGIN OF BLOCK b1 WITH FRAME TITLE TEXT-001.

SELECT-OPTIONS:
  so_inc  FOR gv_incident_no,
  so_rep  FOR gv_reporter,
  so_asg  FOR gv_assigned_to,
  so_stat FOR gv_status,
  so_prio FOR gv_priority,
  so_date FOR gv_created_on.

SELECTION-SCREEN END OF BLOCK b1.

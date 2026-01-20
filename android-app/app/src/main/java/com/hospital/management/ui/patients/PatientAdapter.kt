package com.hospital.management.ui.patients

import android.view.LayoutInflater
import android.view.ViewGroup
import androidx.recyclerview.widget.RecyclerView
import com.hospital.management.data.models.Patient
import com.hospital.management.databinding.ItemPatientBinding
import java.text.SimpleDateFormat
import java.util.Locale

class PatientAdapter(
    private var patients: List<Patient>,
    private val onPatientClick: (Patient) -> Unit
) : RecyclerView.Adapter<PatientAdapter.PatientViewHolder>(), android.widget.Filterable {

    private var patientsFiltered: List<Patient> = patients

    fun updateList(newPatients: List<Patient>) {
        patients = newPatients
        patientsFiltered = newPatients
        notifyDataSetChanged()
    }

    override fun getFilter(): android.widget.Filter {
        return object : android.widget.Filter() {
            override fun performFiltering(constraint: CharSequence?): FilterResults {
                val charString = constraint?.toString() ?: ""
                patientsFiltered = if (charString.isEmpty()) {
                    patients
                } else {
                    val filteredList = ArrayList<Patient>()
                    for (row in patients) {
                        if (row.patientName.lowercase().contains(charString.lowercase()) ||
                            row.medicalRecordNumber.contains(charString)) {
                            filteredList.add(row)
                        }
                    }
                    filteredList
                }
                val filterResults = FilterResults()
                filterResults.values = patientsFiltered
                return filterResults
            }

            override fun publishResults(constraint: CharSequence?, results: FilterResults?) {
                patientsFiltered = results?.values as? List<Patient> ?: emptyList()
                notifyDataSetChanged()
            }
        }
    }

    inner class PatientViewHolder(private val binding: ItemPatientBinding) :
        RecyclerView.ViewHolder(binding.root) {

        fun bind(patient: Patient) {
            binding.tvPatientName.text = patient.patientName
            binding.tvMrn.text = "MRN: ${patient.medicalRecordNumber}"
            binding.tvPhone.text = patient.phone
            
            // Set first character of name
            binding.tvInitials.text = if (patient.patientName.isNotEmpty()) {
                patient.patientName.first().toString().uppercase()
            } else {
                "?"
            }

            binding.root.setOnClickListener {
                onPatientClick(patient)
            }
        }

        private fun formatDate(dateString: String): String {
            return try {
                val inputFormat = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.getDefault())
                val outputFormat = SimpleDateFormat("dd MMM yyyy", Locale.getDefault())
                val date = inputFormat.parse(dateString)
                date?.let { outputFormat.format(it) } ?: dateString.substringBefore("T")
            } catch (e: Exception) {
                dateString.substringBefore("T")
            }
        }
    }

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): PatientViewHolder {
        val binding = ItemPatientBinding.inflate(
            LayoutInflater.from(parent.context),
            parent,
            false
        )
        return PatientViewHolder(binding)
    }

    override fun onBindViewHolder(holder: PatientViewHolder, position: Int) {
        holder.bind(patientsFiltered[position])
    }

    override fun getItemCount() = patientsFiltered.size
}
